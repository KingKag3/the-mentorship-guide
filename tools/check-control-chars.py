#!/usr/bin/env python3
"""Find control characters that a text editor will not show you.

Written after `\\b` in a regex arrived on disk as one 0x08 byte, so eight entries
in app.js's MIGRATIONS list became patterns asking for a literal backspace. They
matched nothing, ever. The page did not break, nothing threw, and the only
symptom was a database error that stopped naming the file that fixes it - a
degradation nobody would report as a bug.

That is the same trap as the blank props.html: a backslash escape written
through a shell heredoc arrives interpreted. `tools/README.md` records the rule.
This is the check that catches it when the rule is forgotten.

Tab, newline and carriage return are fine. Everything else below 0x20 is not:
none of them can be typed deliberately, and every one of them means an escape
was eaten somewhere between the keyboard and the file.

WHAT IT CANNOT CATCH, and this matters: an escape that was eaten into a
character a text file may legitimately contain. `\\n` arriving as a real line
break is the failure that took props.html down, and it is invisible here because
a newline in a file is not suspicious. That one is caught by the parse check in
README.md, which is a different check for a different half of the same trap.

Usage:
    python tools/check-control-chars.py                 # every source file
    python tools/check-control-chars.py app.js
    python tools/check-control-chars.py --root R:/the-mentorship-pine
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The ones a text file legitimately contains.
ALLOWED = {0x09, 0x0A, 0x0D}

SUFFIXES = {".js", ".html", ".css", ".md", ".sql", ".py", ".json", ".pine"}

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".claude"}

NAMES = {
    0x00: "NUL", 0x07: "BEL (\\a)", 0x08: "BACKSPACE (\\b)", 0x0B: "VTAB (\\v)",
    0x0C: "FORMFEED (\\f)", 0x1B: "ESC (\\e)", 0x7F: "DEL",
}


def offenders(text):
    """Every bad character, as (line, column, codepoint)."""
    out = []
    for row, line in enumerate(text.splitlines(), 1):
        for col, ch in enumerate(line, 1):
            point = ord(ch)
            if (point < 0x20 or point == 0x7F) and point not in ALLOWED:
                out.append((row, col, point))
    return out


def self_test():
    """A checker that cannot fail its own test is not evidence of anything.

    check-tdz.py earned this the hard way: its first version reported every page
    clean while one of them was broken.
    """
    broken = "const RE = [/\bfees\b/i];\n"        # a real backspace, twice
    fixed = "const RE = [/\\bfees\\b/i];\n"       # the escape, as source text

    ok = True
    found = offenders(broken)
    if len(found) != 2 or found[0][2] != 0x08:
        print("  finds a backspace           FAILED")
        ok = False
    else:
        print("  finds a backspace           ok")

    if offenders(fixed):
        print("  leaves the escape alone     FAILED")
        ok = False
    else:
        print("  leaves the escape alone     ok")

    if offenders("tabs\tand\r\nnewlines are fine\n"):
        print("  allows tab, CR and LF       FAILED")
        ok = False
    else:
        print("  allows tab, CR and LF       ok")

    return ok


def files(args, root):
    if args:
        return [root / a for a in args]
    found = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in SUFFIXES:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        found.append(path)
    return sorted(found)


def main():
    # --root, so the other repo can be swept without a copy of this file living
    # in it. The pine repo has the same heredoc exposure and no reason to carry
    # a second, drifting version of the same checker.
    args = sys.argv[1:]
    root = ROOT
    if args and args[0] == "--root":
        if len(args) < 2:
            print("--root needs a directory")
            return 2
        root = Path(args[1]).resolve()
        args = args[2:]
        if not root.is_dir():
            print("not a directory: %s" % root)
            return 2

    print("self-test")
    if not self_test():
        print("\nSelf-test failed. Reporting nothing, because a checker that is "
              "wrong about its own examples is worse than no checker.")
        return 2
    print()

    bad = 0
    checked = 0
    for path in files(args, root):
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError) as err:
            print("%-34s %s" % (path.name, err))
            bad += 1
            continue

        checked += 1
        found = offenders(text)
        if not found:
            continue

        bad += 1
        # A path outside the repo is a legitimate thing to check - the way to
        # prove this catches the bug it was written for is to point it at the
        # committed version, which lands in a temporary directory.
        try:
            rel = path.relative_to(root)
        except ValueError:
            rel = path
        for row, col, point in found:
            print("%s:%d:%d  %s" % (rel, row, col, NAMES.get(point, "U+%04X" % point)))

    print()
    if bad:
        print("%d file(s) carry a control character an editor will not show you." % bad)
        print("Almost always a backslash escape eaten by a shell heredoc - see tools/README.md.")
        return 1

    print("%d files checked, no stray control characters." % checked)
    return 0


if __name__ == "__main__":
    sys.exit(main())
