#!/usr/bin/env python3
"""Prove each rule in check-tdz.py with a focused case.

The self-test inside the tool proves it catches the one bug it was built for.
This proves the three rules that keep it from crying wolf, because a checker
that reports three phantom bugs gets ignored and then the real one is ignored
too.
"""
import importlib.util
import os

# Resolved from this file, never hardcoded. It used to name an absolute path on
# one of the two machines, so on the other one this tool raised FileNotFoundError
# and did nothing - and a guard that does not run is not a guard. Two machines,
# one repo: nothing here may assume a drive letter.
HERE = os.path.dirname(os.path.abspath(__file__))

spec = importlib.util.spec_from_file_location(
    'tdz', os.path.join(HERE, 'check-tdz.py'))
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

    # admin.html gates its whole init on `if (me) { ... }`, so every loader call
    # sits one brace deep. Only depth zero was collected, so this shape was
    # invisible - it reached a browser as "Cannot access 'seenColumn' before
    # initialization" with the Accounts tab empty behind it.
    'setup inside a top-level if': ("""<script type="module">
const me = await requireRole(['admin']);
if (me) {
  await loadUsers();
}
let seenColumn = true;
async function loadUsers() { return seenColumn ? 'a' : 'b'; }
</script>""", True),

    # A property name on the left of a destructure is not a read of a variable
    # that happens to share its name. stats.html was reported as reading a
    # `capped` declared thirty lines further down; `capped:` was the key.
    'destructure key is not a read': ("""<script type="module">
const { data, capped: readAll } = await load();
const capped = readAll;
function load() { return {}; }
</script>""", False),

    # And the real bug still has to be caught on the right of the same `=`.
    'right of the equals still counts': ("""<script type="module">
const { data } = await load();
let later = 1;
function load() { return later; }
</script>""", True),

    # A listener registered at the top level opens its body at depth ZERO, and
    # testing that depth for truthiness rather than for None read every listener
    # in stats.html as setup - 39 phantom bugs on a page that works.
    'multi-line listener body at depth zero': ("""<script type="module">
document.getElementById('unit-toggle').addEventListener('change', (e) => {
  if (e.target.name !== 'unit') return;
  render();
});
const later = 1;
function render() { return later; }
</script>""", False),
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
