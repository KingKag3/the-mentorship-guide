#!/usr/bin/env python3
"""Prove each rule in check-tdz.py with a focused case.

The self-test inside the tool proves it catches the one bug it was built for.
This proves the three rules that keep it from crying wolf, because a checker
that reports three phantom bugs gets ignored and then the real one is ignored
too.
"""
import importlib.util

spec = importlib.util.spec_from_file_location('tdz', r'R:\the mentorship\tools\check-tdz.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

CASES = {
    'the real bug, caught': (m.SELF_TEST_BAD, True),
    'the fixed shape, quiet': (m.SELF_TEST_GOOD, False),

    'direct call reaching forward': ("""<script type="module">
setUp();
let later = 1;
function setUp() { return later; }
</script>""", True),

    'property is not the variable': ("""<script type="module">
const closed = [1];
const accounts = closed.map((r) => r.account);
let account = 'all';
</script>""", False),

    'callback body does not run at setup': ("""<script type="module">
btn.addEventListener('click', () => { regroup(); });
let byDay = new Map();
function regroup() { return byDay; }
</script>""", False),

    'a name only inside a string': ("""<script type="module">
console.log('rangeDays is not read here');
let rangeDays = 0;
</script>""", False),

    'declared before use is fine': ("""<script type="module">
let first = 1;
const second = first + 1;
</script>""", False),

    'two hops through functions': ("""<script type="module">
outer();
let deep = 1;
function outer() { return inner(); }
function inner() { return deep; }
</script>""", True),
}

fails = 0
for name, (src, want) in CASES.items():
    got = bool(m.scan_text(src))
    ok = got == want
    fails += 0 if ok else 1
    print('%-38s %s' % (name, 'ok' if ok else 'WRONG  got=%s want=%s' % (got, want)))

print()
print('%d of %d rules proved' % (len(CASES) - fails, len(CASES)))
raise SystemExit(1 if fails else 0)
