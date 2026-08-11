# SQL waiting to be run

A running list. Everything here is written, committed and **not yet applied** to the Supabase
project. Paste into the SQL editor, run, then move the line down to Done with the date.

Every migration in this repo is idempotent and safe to re-run, so if you are unsure whether one has
already gone in, running it again costs nothing. That is a deliberate property, not a coincidence —
see `CLAUDE.md`.

---

## Waiting

Nothing. Everything written is applied — see Done.




### How to tell they worked, if you ever need to check again

```sql
-- closed_at: expect no_close to fall to 0 after a re-import, and backwards to
-- stay 0. A row closing before it opened means the importer picked the wrong
-- fill, which on a short would be easy to do and hard to notice.
select count(*) filter (where closed_at is null)     as no_close,
       count(*) filter (where closed_at < opened_at) as backwards,
       count(*)                                      as total
  from public.trades;

-- risk_settings: empty until the statistics page writes a row, which is
-- expected. The table existing is the thing being checked.
select account, risk_per_trade, updated_at
  from public.risk_settings
 order by account;
```

---

## Done

| File | Run on | Notes |
| --- | --- | --- |
| `session-backfill.sql` | 11 Aug 2026 | Fills `session_kz` from `opened_at` where it was blank. **Verified 11 Aug**: 636 trades tagged, no blanks, and every window's earliest and latest sit strictly inside its own boundary. No blanks is not a fault here - it means nothing was traded outside 07:00-16:00 New York. The boundary check is the one that matters |
| `prop-accounts.sql` | 11 Aug 2026 | **Confirmed from outside**: `prop_accounts` and `prop_presets` both answer 200 with `[]` to the anon key, which is a table that exists behind a policy that holds. Whether the seven ladder rows landed needs a signed-in look at `props.html` |
| `trade-closed-at.sql` | 11 Aug 2026 | **Confirmed by the result**: the statistics page reports median hold times, and nothing but this column can produce them |
| `risk-settings.sql` | 11 Aug 2026 | Same paste. **Not independently confirmed** — the table is only touched when the risk panel is saved, so save a figure once to be sure |
| `profiles-self-service.sql` | 10 Aug 2026 | Verified by attack: a member's own client gets 403 and *"Only an admin can change a role"* |
| `curriculum-foundations.sql` | 11 Aug 2026 | 13 lessons in Prerequisites, all with figures |
| `curriculum-prerequisites.sql` | 10 Aug 2026 | Plus the `phase-3` sort order fix |
| `curriculum-arrays.sql` | 10 Aug 2026 | Content, not schema |
| `trades.sql`, `trade-exits.sql`, `trade-accounts.sql`, `trade-import.sql`, `trade-import-fix.sql` | before 6 Aug 2026 | See `HANDOVER.md` |
| `settings.sql`, `scripts.sql`, `phases.sql`, `lesson-media.sql`, `storage.sql`, `invites.sql`, `schema.sql` | before 6 Aug 2026 | |

---

## One that cannot be run from a browser, and why it is not here

There is no migration for an admin setting another member's password, and there will not be one.
That needs `auth.admin.updateUserById` and therefore the `service_role` key, which bypasses every
policy in this project. A static site has nowhere to keep one.

The admin page sends a reset email instead. The only case that cannot rescue is a member who has
lost access to their email, which would want a Supabase Edge Function holding the key server-side —
an architecture decision to be recorded in `DECISIONS.md` before anyone reaches for it, not
something to add quietly.
