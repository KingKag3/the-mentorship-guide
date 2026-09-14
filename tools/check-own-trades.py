"""Every personal read of `trades` must say whose trades it wants.

Row-level security lets an admin read EVERY member's shared trades - the
"admins read shared" policy, which is what the mentor's Review tab runs on.
So on this table, "rows the database will return" and "my rows" are different
sets for exactly one kind of user, and they are the same set for everybody
else. A query that forgets `.eq('user_id', ...)` therefore passes every test a
member can run and is wrong only for the admin, which is to say only for the
person who built the site.

Found on 14 September 2026, when accounts removed from the prop page kept being
offered on the import page. Six personal reads had no owner filter, so for the
admin any other member's shared trades were mixed into the journal, calendar,
statistics, prop cards, CSV export and import account list.

This reads each `supabase.from('trades')` chain and flags a SELECT that says
neither whose rows it wants nor why it wants other people's. Allowed:

  - `.eq('user_id', ...)` - my rows;
  - `.eq('shared_with_mentor', true)` - the mentor's queue, where reading
    across members is the feature (admin.html, and the masthead count in
    app.js);
  - anything addressed by id (`.eq('id', ...)`, `.in('external_id', ...)`),
    which reads or writes known rows and is protected by the policies either
    way.

Writes are ignored: insert, update, upsert and delete are refused by RLS for a
row that is not the caller's, so a missing filter there cannot mix data in.

A directory can be passed, so the checker can be pointed at an old copy of the
site to prove it would have caught what it exists to catch:

    python tools/check-own-trades.py
    python tools/check-own-trades.py path/to/old/copy
"""

import pathlib
import re
import sys

ROOT = (pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1
        else pathlib.Path(__file__).resolve().parent.parent)

# End of the statement, or the close of fetchPaged(() => ..., cap).
CHAIN_END = re.compile(r';|\)\s*,\s*[A-Z_0-9]+\s*\)')
WRITE = re.compile(r'\.(insert|update|upsert|delete)\s*\(')
OWNER = re.compile(r"\.eq\(\s*'user_id'")
MENTOR = re.compile(r"\.eq\(\s*'shared_with_mentor'\s*,\s*true\s*\)")
BY_ID = re.compile(r"\.(eq|in)\(\s*'(id|external_id)'")


def ok(chain):
    if WRITE.search(chain):
        return True
    return bool(OWNER.search(chain) or MENTOR.search(chain) or BY_ID.search(chain))


def chains(text):
    for m in re.finditer(r"\.from\(\s*'trades'\s*\)", text):
        end = CHAIN_END.search(text, m.end())
        stop = end.end() if end else min(len(text), m.end() + 600)
        yield m.start(), text[m.start():stop]


def self_test():
    cases = [
        ('flags an unfiltered select', False,
         "await supabase.from('trades').select('*').order('opened_at');"),
        ('passes a filtered select', True,
         "await supabase.from('trades').select('*').eq('user_id', profile.id).order('x');"),
        ('flags an unfiltered fetchPaged', False,
         "fetchPaged(() => supabase.from('trades').select('account')\n"
         "  .order('opened_at', { ascending: true }), 50000);"),
        ('flags one with a named cap', False,
         "fetchPaged(() => supabase\n  .from('trades')\n  .select('*')\n"
         "  .order('opened_at', { ascending: true }), STATS_CAP);"),
        ('passes the mentor queue', True,
         "await supabase.from('trades').select('id').eq('shared_with_mentor', true).limit(9);"),
        ('passes a read by id', True,
         "await supabase.from('trades').select('id').in('external_id', ids);"),
        ('ignores writes', True,
         "await supabase.from('trades').delete().in('id', picked);"),
    ]
    print('Self-test')
    good = True
    for name, want, code in cases:
        passed = ok(next(chains(code))[1]) == want
        good = good and passed
        print('  %-32s %s' % (name, 'ok' if passed else 'FAILED'))
    return good


def main():
    if not self_test():
        print('\nThe checker is broken; nothing below can be trusted.')
        return 2

    found = 0
    files = sorted(list(ROOT.glob('*.html')) + list(ROOT.glob('*.js')))
    print()
    for path in files:
        text = path.read_text(encoding='utf-8')
        for start, chain in chains(text):
            # Comments quoting an example are not queries.
            line_start = text.rfind('\n', 0, start) + 1
            if text[line_start:start].lstrip().startswith(('*', '//')):
                continue
            if not ok(chain):
                line = text.count('\n', 0, start) + 1
                print('%-16s line %-5d reads trades with no user_id filter' % (path.name, line))
                found += 1

    print('\n%d unscoped reads of trades across %d files' % (found, len(files)))
    return 1 if found else 0


if __name__ == '__main__':
    sys.exit(main())
