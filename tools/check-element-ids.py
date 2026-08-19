#!/usr/bin/env python3
"""Find getElementById calls naming an id the page never renders.

    python tools/check-element-ids.py            # every page
    python tools/check-element-ids.py import.html

WHY THIS EXISTS

`import.html` wired its buttons like this:

    for (const id of ['do-import', 'do-import-top']) {
      $(id).addEventListener('click', runImport);
    }

`do-import-top` was planned and never built. `$` is `getElementById`, so the
second turn of that loop read `null.addEventListener` and threw - and it threw
BEFORE the next loop, which is the one that wires Cancel. So Cancel did nothing
at all, on the one page where the only other way out of a wrong file is to
reload it. Nothing looked broken: the button was drawn, it just never answered.

That is the shape worth catching. A missing element is not a syntax error, it
is not caught by any checker here, and it fails at the moment somebody uses the
feature rather than at the moment the page loads.

WHAT COUNTS AS RENDERED

Any `id="thing"` anywhere in the file, whether it sits in static markup or
inside a JavaScript string that builds markup later. Both are how these pages
work and neither is more real than the other, so both count.

WHAT IT CANNOT DO

An id built by concatenation - `'s-' + field.key` - is invisible to it, and so
is a reference built the same way. Both are skipped rather than guessed at: a
checker that invents a bug gets ignored, and then the real one is ignored with
it.
"""

import pathlib
import re
import sys

# id="thing" and id='thing', including inside a JS string that writes markup.
# Backslashes are stripped from the text before this runs, so an id written
# inside a double-quoted JS string reads the same as any other.
RENDERED = re.compile(r"""\bid\s*=\s*["']([A-Za-z][\w:.-]*)""")
# and the same thing assigned rather than written: el.id = 'thing'
ASSIGNED = re.compile(r"""\.id\s*=\s*["']([A-Za-z][\w:.-]*)["']""")

# $('thing').something - a lookup whose result is used on the spot, which is
# the only shape that can throw.
#
# A guarded one is deliberately not flagged. calendar.html writes
#
#     const note = document.getElementById('count-note') || $('summary');
#
# where the id is absent on purpose and the fallback is the whole point. That
# is not a bug and reporting it as one is how a checker gets ignored. Requiring
# the trailing `.` also skips `?.`, which is guarded for the same reason.
LOOKED_UP = re.compile(
    r"""(?:getElementById|\$)\(\s*["']([A-Za-z][\w:.-]*)["']\s*\)\s*\.""")
# and the loop shape that caused this: a list of bare id strings fed to $(id).
IN_LIST = re.compile(r"""for\s*\(\s*const\s+\w+\s+of\s+\[([^\]]*)\]\s*\)""")
STRING_ITEM = re.compile(r"""["']([A-Za-z][\w:.-]*)["']""")


def scan_text(text):
    # An escaped quote inside a JS string is still a quote. Dropping every
    # backslash first means one pattern covers both spellings.
    text = text.replace('\\', '')
    rendered = set(RENDERED.findall(text)) | set(ASSIGNED.findall(text))

    wanted = {}
    for m in LOOKED_UP.finditer(text):
        wanted.setdefault(m.group(1), text.count('\n', 0, m.start()) + 1)

    # `for (const id of ['a', 'b']) { $(id)... }` - only when the body really
    # does look one up, so an unrelated list of strings is not read as ids.
    for m in IN_LIST.finditer(text):
        tail = text[m.end():m.end() + 200]
        if not re.search(r"""(?:getElementById|\$)\(\s*\w+\s*\)""", tail):
            continue
        line = text.count('\n', 0, m.start()) + 1
        for name in STRING_ITEM.findall(m.group(1)):
            wanted.setdefault(name, line)

    return sorted((line, name) for name, line in wanted.items()
                  if name not in rendered)


def self_test():
    """The exact shape that killed Cancel, and the shape that fixes it."""
    bad = """<div id="preview"></div>
<script type="module">
const $ = (id) => document.getElementById(id);
$('preview').innerHTML = '<button id="do-import">Import</button>';
for (const id of ['do-import', 'do-import-top']) {
  $(id).addEventListener('click', runImport);
}
</script>"""

    good = bad.replace(
        "'<button id=\"do-import\">Import</button>'",
        "'<button id=\"do-import\">Import</button><button id=\"do-import-top\">Import</button>'")

    # An absent id with a fallback behind it is a design, not a fault.
    guarded = """<div id="summary"></div>
<script type="module">
const $ = (id) => document.getElementById(id);
const note = document.getElementById('count-note') || $('summary');
note.textContent = 'capped';
</script>"""

    hit = [n for _, n in scan_text(bad)]
    clean = scan_text(good)
    quiet = scan_text(guarded)

    print('self-test')
    print('  flags the missing id      %s'
          % ('ok' if hit == ['do-import-top'] else 'FAILED - %s' % hit))
    print('  passes once it is built   %s'
          % ('ok' if not clean else 'FAILED - %s' % clean))
    print('  ignores a guarded lookup  %s'
          % ('ok' if not quiet else 'FAILED - %s' % quiet))
    print()
    return hit == ['do-import-top'] and not clean and not quiet


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
        found = scan_text(path.read_text(encoding='utf-8'))
        if found:
            total += len(found)
            print(name)
            for line, ident in found:
                print('  line %-5d looks up %-22s which nothing renders' % (line, ident))
        else:
            print('%-18s ok' % name)

    print()
    print('%d lookup%s with no element' % (total, '' if total == 1 else 's'))
    return 1 if total else 0


if __name__ == '__main__':
    raise SystemExit(main())
