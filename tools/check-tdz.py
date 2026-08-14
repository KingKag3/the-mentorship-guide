#!/usr/bin/env python3
"""Find const/let read during setup, before the line that declares it.

    python tools/check-tdz.py            # every page
    python tools/check-tdz.py stats.html

WHY THIS EXISTS

`stats.html` produced the same failure three times in one session:

    let unit = rCount() ...        // runs immediately
    ...
    let rangeDays = 0;             // forty lines further down

`rCount()` reaches `rangeDays` through `inRange()`, and at that moment
`rangeDays` is still in its temporal dead zone. The page dies on load with a
blank body and a console message nobody sees. A `function` declaration would
have been hoisted and worked; a `const` or `let` is not, and the difference is
invisible while reading.

There is no JavaScript runtime on these machines, so nothing else catches it
before a member does.

IT HAS TO FOLLOW CALLS, WHICH THE FIRST VERSION DID NOT

The first version only looked for the variable being mentioned at the top level
on an earlier line. That never happens in the real bug: the read is always
inside a function, and it is the *call* that is at the top level. It reported
every page clean, including one that was broken at the time.

So it builds a small call graph. For each statement that runs during setup, it
walks the functions that statement calls - and the functions those call - and
checks every identifier any of them touches against the declaration order.

WHAT IT STILL CANNOT DO

Resolve a call through a variable, an object property or a callback passed
elsewhere. Recursion is walked once. False positives are possible: a function
may mention a name on a branch that never runs during setup.

A checkable list of suspicions beats a blank page, which is the alternative.
"""

import pathlib
import re
import sys

DECL = re.compile(r'^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*[=;]')
DESTRUCTURE = re.compile(r'^\s*(?:const|let)\s*[{\[]([^}\]]*)[}\]]\s*=')
FN_DECL = re.compile(r'^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(')
FN_CONST = re.compile(r'^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function\b)')
CALL = re.compile(r'\b([A-Za-z_$][\w$]*)\s*\(')

# A line that opens a function body, wherever it sits. `function` in any
# position, or an arrow immediately followed by a brace. An arrow with an
# expression body opens nothing and is handled by the `=>` split further down.
OPENS_CALLABLE = re.compile(r'\bfunction\b|=>\s*\{')
WORD = re.compile(r'[A-Za-z_$][\w$]*')

KEYWORDS = {
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
    'await', 'async', 'new', 'true', 'false', 'null', 'undefined', 'typeof',
    'this', 'try', 'catch', 'throw', 'import', 'from', 'export', 'of', 'in',
    'default', 'class', 'switch', 'case', 'break', 'continue', 'delete', 'void',
    'document', 'window', 'console', 'Math', 'Number', 'String', 'Array',
    'Object', 'JSON', 'Date', 'Set', 'Map', 'Promise', 'location', 'history',
    'setTimeout', 'parseFloat', 'parseInt', 'isNaN', 'encodeURIComponent',
    'URLSearchParams', 'Boolean', 'RegExp', 'Error',
}


def strip_noise(line):
    """Drop strings, template literals and line comments, so a word inside a
    message is not mistaken for a reference to a variable."""
    line = re.sub(r'//.*$', '', line)
    line = re.sub(r"'(?:\\.|[^'\\])*'", "''", line)
    line = re.sub(r'"(?:\\.|[^"\\])*"', '""', line)
    line = re.sub(r'`(?:\\.|[^`\\])*`', '``', line)
    # A dotted name is somebody else's property, never the local variable.
    # `closed.map((r) => r.account)` contains the word `account`, and reading
    # that as the `account` declared on the next line reports a bug that cannot
    # happen.
    line = re.sub(r'\.\s*[A-Za-z_$][\w$]*', '.', line)
    return line


def module_script(text):
    marker = '<script type="module">'
    if marker not in text:
        return text, 0
    head, rest = text.split(marker, 1)
    return rest.split('</script>', 1)[0], head.count('\n') + 1


def clean_lines(body):
    """Every line with strings and comments removed, block comments included."""
    out = []
    in_block = False
    for line in body.split('\n'):
        if in_block:
            if '*/' in line:
                line = line.split('*/', 1)[1]
                in_block = False
            else:
                out.append('')
                continue
        if '/*' in line:
            before, after = line.split('/*', 1)
            if '*/' in after:
                line = before + after.split('*/', 1)[1]
            else:
                line = before
                in_block = True
        out.append(strip_noise(line))
    return out


def scan_text(raw):
    body, offset = module_script(raw)
    lines = clean_lines(body)

    decls = {}        # const/let declared at the top level -> line number
    setup = []        # (line, text) that executes during setup
    funcs = {}        # name -> [line numbers of its body]
    depth = 0
    current = None      # (name, depth at which its body opened)
    in_callable = None  # depth at which a function body opened, at any level

    for i, clean in enumerate(lines, start=1):
        opens = clean.count('{') + clean.count('(') + clean.count('[')
        closes = clean.count('}') + clean.count(')') + clean.count(']')

        if depth == 0:
            m = DECL.match(clean)
            if m:
                decls.setdefault(m.group(1), i)
            d = DESTRUCTURE.match(clean)
            if d:
                for part in d.group(1).split(','):
                    name = part.split(':')[-1].strip()
                    if name and WORD.fullmatch(name):
                        decls.setdefault(name, i)

            fn = FN_DECL.match(clean) or FN_CONST.match(clean)
            if fn:
                current = (fn.group(1), depth)
                funcs.setdefault(fn.group(1), [])
            elif clean.strip():
                setup.append((i, clean))

        if current:
            funcs[current[0]].append(i)
        # `is None`, never `not in_callable`. Zero is a real depth - it is the
        # depth at which a top-level addEventListener callback opens - and `not 0`
        # is True, so the falsy test read every listener body in stats.html as
        # setup and reported 39 dead-zone reads that cannot happen.
        elif depth > 0 and clean.strip() and in_callable is None:
            # A BRACE OPENED AT THE TOP LEVEL BY SOMETHING THAT IS NOT A
            # FUNCTION STILL RUNS DURING SETUP.
            #
            # This is the case that let a real bug through. admin.html gates its
            # whole init on `if (me) { ... await loadUsers(); ... }`, so every
            # loader call sits at depth 1 - and only depth 0 was being collected.
            # The page failed with "Cannot access 'seenColumn' before
            # initialization" while this reported eighteen pages clean.
            #
            # `in_callable` is what keeps this honest. Without it, the body of a
            # multi-line arrow inside a top-level object literal would be read as
            # setup, and those bodies run on an event.
            setup.append((i, clean))

        # Are we inside a function body, at any depth? Tracked separately from
        # `current`, which only knows about functions declared at the top level.
        if in_callable is None and OPENS_CALLABLE.search(clean):
            in_callable = depth
        elif in_callable is not None and depth + opens - closes <= in_callable:
            in_callable = None

        depth += opens - closes
        if depth <= 0:
            depth = 0
            current = None

    # Which names each function touches, and which it calls.
    touches = {}
    for name, nums in funcs.items():
        text = ' '.join(lines[n - 1] for n in nums)
        touches[name] = set(WORD.findall(text)) - KEYWORDS

    def reachable(names, seen=None):
        """Every name these functions touch, following any function they
        mention rather than only ones they syntactically call.

        `rows.filter(inRange)` passes inRange without a call syntax anywhere
        near it, and that is exactly the shape the real bug took - so following
        only `name(` found nothing and reported the page clean. Following any
        mentioned function name over-reaches a little and catches callbacks,
        which is the trade worth making.
        """
        seen = seen if seen is not None else set()
        out = set()
        for n in names:
            if n in seen or n not in touches:
                continue
            seen.add(n)
            out |= touches[n]
            out |= reachable(touches[n] & touches.keys(), seen)
        return out

    problems = []
    for line_no, clean in setup:
        # Only what runs NOW. A name inside a callback on this line - the body
        # of an arrow handed to addEventListener - executes on an event, not
        # during setup, so following it invented three bugs in calendar.html
        # that cannot happen. Everything before the first => is immediate.
        immediate = clean.split('=>')[0] if '=>' in clean else clean
        names = set(WORD.findall(immediate)) - KEYWORDS
        names |= reachable(names & touches.keys())
        for word in sorted(names):
            declared = decls.get(word)
            if declared and declared > line_no:
                # offset is the marker's own line; body line 1 shares it.
                problems.append((line_no + offset - 1, word, declared + offset - 1))
    return problems


def scan(path):
    return scan_text(path.read_text(encoding='utf-8'))


SELF_TEST_BAD = """<script type="module">
const rows = [1, 2, 3];
const rCount = () => rows.filter(inRange).length;
let unit = rCount() > 0 ? 'r' : 'money';
let rangeDays = 0;
function inRange(r) { return rangeDays === 0; }
</script>"""

SELF_TEST_GOOD = """<script type="module">
const rows = [1, 2, 3];
let rangeDays = 0;
const rCount = () => rows.filter(inRange).length;
let unit = rCount() > 0 ? 'r' : 'money';
function inRange(r) { return rangeDays === 0; }
</script>"""


def self_test():
    """Prove it catches the bug it was written for.

    This is the exact shape that killed stats.html three times, reduced to five
    lines. The first version of this checker passed it, which is how it came to
    report every page clean while one of them was broken.
    """
    bad = scan_text(SELF_TEST_BAD)
    good = scan_text(SELF_TEST_GOOD)

    ok_bad = any(w == 'rangeDays' for _, w, _ in bad)
    ok_good = not good

    print('self-test')
    print('  flags the broken shape   %s' % ('ok' if ok_bad else 'FAILED'))
    print('  passes the fixed shape   %s' % ('ok' if ok_good else 'FAILED - %s' % good))
    print()
    return ok_bad and ok_good


def main():
    root = pathlib.Path(__file__).resolve().parent.parent

    if not self_test():
        print('The checker itself is broken. Fix that before believing a clean run.')
        return 2

    targets = sys.argv[1:] or [p.name for p in sorted(root.glob('*.html'))]
    total = 0

    for name in targets:
        path = root / name
        if not path.is_file():
            print('%-18s not found' % name)
            continue
        found = scan(path)
        if found:
            total += len(found)
            print('%s' % name)
            for line_no, word, declared in found:
                print('  line %-5d reads %-18s declared on line %d' % (line_no, word, declared))
        else:
            print('%-18s ok' % name)

    print()
    print('%d suspected dead-zone read%s' % (total, '' if total == 1 else 's'))
    return 1 if total else 0


if __name__ == '__main__':
    raise SystemExit(main())
