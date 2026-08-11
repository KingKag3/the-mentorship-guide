#!/usr/bin/env python3
"""Every name a page imports must actually be exported by the module it names.

Written after stats.html went blank. Three helpers were added to the wrong one
of two adjacent import statements - they lived in app.js and were asked of
analytics.js. That is valid JavaScript, so `node --check` passes; the failure
only happens when the browser tries to link the module, and the whole script
then never runs.

Which produces the worst symptom this project has: a page that renders its
heading, its footer and nothing between. Identical to a broken build, identical
to a slow network, and identical to the blank members page that cost a session
in August. app.js already carries a deadline and a placeholder for that reason;
this catches the version those cannot help with, because the module never
executes at all.

`tools/check-tdz.py` catches the other blank-page cause - a const read during
setup before it is declared. Same failure, different mechanism, so they are
separate checks.

Usage:
    python tools/check-imports.py
    python tools/check-imports.py --quiet
"""

import glob
import os
import re
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# import { a, b as c } from './mod.js'
IMPORT = re.compile(r"import\s*\{([^}]*)\}\s*from\s*'(\./[^']+)'", re.S)

# export function x / export const x / export class x, and `export { a, b }`
EXPORT_DECL = re.compile(r"^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)", re.M)
EXPORT_LIST = re.compile(r"^export\s*\{([^}]*)\}", re.M)


def exported(path):
    """Every name a module makes available."""
    try:
        with open(path, encoding='utf-8') as fh:
            src = fh.read()
    except OSError:
        return None

    names = set(EXPORT_DECL.findall(src))
    for block in EXPORT_LIST.findall(src):
        for part in block.split(','):
            part = part.strip()
            if not part:
                continue
            # `export { a as b }` publishes b
            names.add(part.split(' as ')[-1].strip())
    return names


def imports_in(src):
    """(module, [local names]) for each import in a file."""
    out = []
    for block, module in IMPORT.findall(src):
        names = []
        for part in block.split(','):
            part = part.strip()
            if not part:
                continue
            # `import { a as b }` asks the module for a
            names.append(part.split(' as ')[0].strip())
        out.append((module, names))
    return out


def main():
    quiet = '--quiet' in sys.argv
    cache = {}
    problems = []
    checked = 0

    for path in sorted(glob.glob(os.path.join(HERE, '*.html'))):
        with open(path, encoding='utf-8') as fh:
            src = fh.read()

        for module, names in imports_in(src):
            target = os.path.normpath(os.path.join(HERE, module.lstrip('./')))
            if target not in cache:
                cache[target] = exported(target)
            available = cache[target]

            if available is None:
                problems.append((os.path.basename(path), module, '(module not found)'))
                continue

            checked += 1
            for name in names:
                if name not in available:
                    problems.append((os.path.basename(path), module, name))

    if problems:
        print('Names asked of a module that does not export them:\n')
        for page, module, name in problems:
            print('  %-16s %-16s %s' % (page, module, name))
        print('\n%d problem(s). A page importing a missing name renders nothing at all.'
              % len(problems))
        return 1

    if not quiet:
        print('%d import statements checked, every name resolves.' % checked)
    return 0


if __name__ == '__main__':
    sys.exit(main())
