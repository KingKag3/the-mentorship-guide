#!/usr/bin/env python3
"""No name may be declared twice at the top level of one module.

Written after `const SEEN_KEY` was added to app.js while a `const SEEN_KEY`
already existed 800 lines below it. That is a SyntaxError: app.js then fails to
load, and app.js is imported by every page on the site - so the whole thing goes
blank at once. It reached a browser, which is the part worth explaining.

WHY THE OBVIOUS CHECK DOES NOT CATCH IT

`node --check app.js` PASSES on a duplicate declaration. Measured, not assumed:

    const A = 1; const A = 2;                       in a .js   -> caught
    import {x} from './y.js'; const A = 1; const A = 2;  .js    -> NOT caught
    the same three lines in a .mjs                             -> caught

When a `.js` file contains an `import`, node decides it is an ES module and then
skips the syntax check rather than running it as one. Every module in this repo
contains an import. So `node --check` has been reporting clean on exactly the
files it cannot check, which is worse than not running it.

That can be worked around by copying to `.mjs` first - and this checker does not
do that, because `HANDOVER.md` records that one of the two machines has no
JavaScript runtime at all. A check that only runs on one machine is a check that
does not run.

WHAT IT LOOKS AT

Top-level `const`, `let`, `class` and `function` in .js modules, and in the
`<script type="module">` block of each .html page. Only column zero: anything
indented is inside something, and shadowing inside a function is legal and
common.

`var` is deliberately ignored. Redeclaring a var is legal JavaScript, and while
it is usually a mistake it is not the failure this exists to prevent.

This is the third checker of its kind, and they divide by mechanism rather than
by taste, because each produces the same symptom - a page that renders its
heading, its footer, and nothing between:

    check-imports.py     a name asked of the wrong module
    check-tdz.py         a const read during setup before it is declared
    check-duplicates.py  the same name declared twice in one scope

Usage:
    python tools/check-duplicates.py
    python tools/check-duplicates.py --quiet
"""

import glob
import os
import re
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Column zero only. Indented declarations are inside a function or a block,
# where redeclaring is legal and shadowing is ordinary.
DECL = re.compile(
    r"^(?:export\s+)?(?:async\s+)?(const|let|class|function)\s+([A-Za-z_$][\w$]*)",
    re.M)

MODULE_BLOCK = re.compile(
    r"<script\s+type=[\"']module[\"'][^>]*>(.*?)</script>", re.S | re.I)

# Destructuring is a declaration too: `const { a, b } = x` declares a and b.
DESTRUCTURE = re.compile(
    r"^(?:export\s+)?(const|let)\s*\{([^}]*)\}\s*=", re.M)

# `import { a, b as c } from '...'` and `import d from '...'` bind names too,
# and colliding with one of those is the same SyntaxError.
IMPORT_NAMED = re.compile(r"^import\s*\{([^}]*)\}\s*from", re.M)
IMPORT_DEFAULT = re.compile(r"^import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)", re.M)


def strip_noise(src):
    """Remove block comments, line comments and string bodies.

    A declaration quoted inside a comment is not a declaration, and this file
    itself is full of them. Strings are blanked rather than deleted so that
    line numbers survive - the report is useless without them.
    """
    out = []
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ''

        if c == '/' and nxt == '*':
            end = src.find('*/', i + 2)
            end = n if end == -1 else end + 2
            out.append(re.sub(r'[^\n]', ' ', src[i:end]))
            i = end
            continue

        if c == '/' and nxt == '/':
            end = src.find('\n', i)
            end = n if end == -1 else end
            out.append(' ' * (end - i))
            i = end
            continue

        if c in '"\'`':
            quote = c
            j = i + 1
            closed = False
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                # A ' or " string cannot contain a raw newline. Hitting one
                # means this quote never opened a string at all - the usual
                # culprit is an apostrophe inside a regex literal, and
                # `.replace(/'/g, '&#39;')` in app.js is exactly that. Treated
                # as a string, it swallowed the next 800 lines, which is why
                # the first version of this checker reported app.js clean while
                # holding the duplicate it was written to find.
                if quote != '`' and src[j] == '\n':
                    break
                if src[j] == quote:
                    j += 1
                    closed = True
                    break
                j += 1

            if not closed:
                # Not a string. Emit the character and carry on from after it.
                out.append(c)
                i += 1
                continue

            out.append(re.sub(r'[^\n]', ' ', src[i:j]))
            i = j
            continue

        out.append(c)
        i += 1

    return ''.join(out)


def line_of(src, pos):
    return src.count('\n', 0, pos) + 1


def declarations(src):
    """[(name, line, kind)] for every top-level binding."""
    clean = strip_noise(src)
    found = []

    for m in DECL.finditer(clean):
        found.append((m.group(2), line_of(clean, m.start()), m.group(1)))

    for m in DESTRUCTURE.finditer(clean):
        for part in m.group(2).split(','):
            part = part.strip()
            if not part:
                continue
            # `{ a: b }` binds b; `{ a = 1 }` binds a.
            name = part.split(':')[-1].split('=')[0].strip()
            if re.match(r'^[A-Za-z_$][\w$]*$', name):
                found.append((name, line_of(clean, m.start()), m.group(1)))

    for m in IMPORT_NAMED.finditer(clean):
        for part in m.group(1).split(','):
            part = part.strip()
            if not part:
                continue
            name = part.split(' as ')[-1].strip()
            if re.match(r'^[A-Za-z_$][\w$]*$', name):
                found.append((name, line_of(clean, m.start()), 'import'))

    for m in IMPORT_DEFAULT.finditer(clean):
        found.append((m.group(1), line_of(clean, m.start()), 'import'))

    return found


def check(label, src, offset=0):
    """Report every name declared more than once. Returns a list of strings."""
    seen = {}
    problems = []

    for name, line, kind in declarations(src):
        line += offset
        if name in seen:
            first_line, first_kind = seen[name]
            problems.append(
                '  %-18s %-22s %s on line %d, already %s on line %d'
                % (label, name, kind, line, first_kind, first_line))
        else:
            seen[name] = (line, kind)

    return problems


def self_test():
    """The checker has to fail on something known bad.

    check-tdz.py carries the same guard, for the same reason: its first version
    reported eighteen pages clean while one of them was broken. A checker that
    silently stops working is worse than no checker, because it is believed.
    """
    bad = "import { a } from './x.js';\nconst A = 1;\nconst A = 2;\n"
    if not check('self-test', bad):
        return 'a duplicate const was not reported'

    ok = ("const A = 1;\n"
          "function f() {\n  const A = 2;\n}\n"
          "// const A = 3;\n"
          "const s = 'const A = 4;';\n")
    noise = check('self-test', ok)
    if noise:
        return 'reported a false positive: ' + noise[0].strip()

    shadow = "import { escapeHtml } from './app.js';\nconst escapeHtml = 1;\n"
    if not check('self-test', shadow):
        return 'a const colliding with an import was not reported'

    # The one that actually happened. A regex literal holding an apostrophe used
    # to be read as an opening quote, blanking everything after it - so the
    # duplicate below went unseen and the file was reported clean. This is the
    # regression test for the checker itself.
    regex = ("const A = 1;\n"
             "const esc = (s) => s.replace(/'/g, '&#39;');\n"
             "const A = 2;\n")
    if not check('self-test', regex):
        return 'a duplicate after a regex literal containing a quote was not reported'

    return None


def main():
    quiet = '--quiet' in sys.argv

    failure = self_test()
    if failure:
        print('check-duplicates.py is not working: ' + failure)
        print('Refusing to report on the repo. Fix the checker first.')
        return 2

    problems = []
    checked = 0

    for path in sorted(glob.glob(os.path.join(HERE, '*.js'))):
        with open(path, encoding='utf-8') as fh:
            src = fh.read()
        checked += 1
        problems += check(os.path.basename(path), src)

    for path in sorted(glob.glob(os.path.join(HERE, '*.html'))):
        with open(path, encoding='utf-8') as fh:
            src = fh.read()
        for m in MODULE_BLOCK.finditer(src):
            checked += 1
            offset = src.count('\n', 0, m.start(1))
            problems += check(os.path.basename(path), m.group(1), offset)

    if problems:
        print('Names declared twice at the top level of one module:\n')
        for p in problems:
            print(p)
        print('\n%d problem(s). Each one is a SyntaxError: the module does not '
              'load, and every page importing it renders nothing.' % len(problems))
        return 1

    if not quiet:
        print('%d modules checked, no duplicate top-level declarations.' % checked)
    return 0


if __name__ == '__main__':
    sys.exit(main())
