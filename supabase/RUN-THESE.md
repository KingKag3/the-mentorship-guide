# SQL waiting to be run

A running list. Everything here is written, committed and **not yet applied** to the Supabase
project. Paste into the SQL editor, run, then move the line down to Done with the date.

Every migration in this repo is idempotent and safe to re-run, so if you are unsure whether one has
already gone in, running it again costs nothing. That is a deliberate property, not a coincidence —
see `CLAUDE.md`.

---

## Waiting

Nothing.

`prop-presets-by-product.sql` went in on 18 August 2026 and supersedes
`prop-preset-drawdown.sql` entirely. Both are recorded under **Done**.

## Held back on purpose

Written, committed, and **deliberately not run**. Not waiting on anybody &mdash; waiting on
evidence. Do not clear these out of habit.

### `account-adjustments.sql` &mdash; hold until there is a funded account

Payouts, and `prop_accounts.payout_lowers_mark`. Everything about it is proved on fixtures and
nothing about it has met a real withdrawal.

**Why it waits.** The question it turns on &mdash; does a payout lower the firm's high-water mark
&mdash; decides whether a withdrawal costs you its full value in room or nothing at all. Nobody here
has had a funded account. Applying it now would put a table and a checkbox in front of a member with
no way to answer the question and no reason to trust the answer, which is how the drawdown lock went
in: seeded from a published rule, contradicted by the member's own account table inside a day.

**It costs nothing to wait.** The accounts page only offers the payout controls on a `funded`
account, so with none configured the page is identical either way. The prompt to run this appears by
itself, on the first funded card, at the moment somebody can actually check the answer.

**Run it when:** an evaluation passes and a funded account exists on the firm's dashboard. Then take
the first payout, record it, and compare *Max Balance* before and after &mdash; that single
observation settles `payout_lowers_mark` and is the whole reason this was built.


---

The privacy migration that was outstanding here has been applied *and* shown to work — see
**Verified by attack** in `HANDOVER.md` for what was observed, and for the errors that look like a
pass and are not.


### The editor runs your whole script as one transaction

**One failing statement discards every statement before it.** A file that errors on its last line
leaves the database exactly as it was, and running it a second time leaves it exactly as it was
twice.

That is not obvious from the outside, and it cost an evening here: `prop-presets-by-product.sql`
was run twice, reported an error somewhere in the middle both times, and left nothing behind —
while the accounts page could only report that the presets table was empty, which was true and was
not the reason.

**So when a migration seems not to have taken, the question is never "did it run".** It is *what did
the editor say in red*, and the answer is usually one statement in the middle that the rest of the
file is standing on. `supabase/prop-presets-step-by-step.sql` exists for this: the same work in four
independent pieces, so a failure names itself instead of erasing the evidence.

---

### One thing about this editor, before any of the queries below

**The SQL editor connects as the table owner, and row-level security does not
apply to the owner.** A `select` on `trades`, `profiles` or anything else there
returns **every member's** rows, and nothing in the result says so.

So a total taken here without a `user_id` filter is a total across the whole
membership rather than one person's, and — the part that bites — a
`delete ... where account in (...)` reaches across every member in the table,
with `trade_reviews` cascading behind it.

Join `profiles` and name the owner, on every query. The shape:

```sql
select count(*), sum(t.net_pnl)
  from public.trades t
  join public.profiles p on p.id = t.user_id
 where p.email = 'kingkag3@proton.me';
```

`supabase/stray-accounts.sql` used to be the worked example and was deleted on
17 August, once the question it answered had been answered. The pattern is
written out here instead, because a pointer to a file that is not there is the
same stale instruction the deletion was avoiding.

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

-- trade_reviews: the table, and the five policies it needs. Expect 5 rows.
-- Fewer means the create ran and part of the policy block did not, which is the
-- one state that looks fine from the browser until somebody replies.
select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'trade_reviews'
 order by policyname;

-- journal-media-privacy: expect exactly one row with permissive = 'RESTRICTIVE'.
-- Its absence is the whole bug coming back, and nothing in the UI would show it.
select policyname, permissive, cmd
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and cmd in ('SELECT', 'ALL')
 order by permissive desc, policyname;
```

The query above says the policy exists. It does not say it works — that needs two signed-in
accounts, and the steps are in the **Untested** section of `HANDOVER.md`.

---

## Done

| File | Run on | Notes |
| --- | --- | --- |
| `drawdown-eod.sql`, `prop-presets-by-product.sql` | 18 Aug 2026 | Two things the site had been getting wrong about the same account. `drawdown_type` had existed since the first migration and was never read, so every card was modelled as an intraday trailing drawdown and every caveat said the figure was a floor — which is false of an end-of-day account, where the closing balances the journal holds are the numbers the firm used. And the presets were keyed on `(firm, size)`, which cannot separate three Apex products: **Legacy and Intraday both trail intraday and their drawdowns differ by up to $1,000**, so a size match filled in the larger ladder — room the account does not have. Both fixed, with a `product` column on presets and accounts, and `drawdown_type` read from the product's own preset row so the two cannot drift. **Every drawdown is derived rather than quoted**: Apex publishes the safety net and defines it as the drawdown plus $100, so all three ladders fall out of their own payout tables — which independently confirms the six Legacy figures previously seeded on trust. **Not confirmed from outside**, and there is nothing to confirm until an account is classified: every row keeps `trailing` and a null product, which looks up no terms at all rather than the wrong ones |
| `prop-presets-by-product.sql` | 18 Aug 2026 | A `product` column on presets and accounts, the presets re-keyed on `(firm, product, size)`, and all three Apex ladders seeded. **It took five attempts and every one of them is worth knowing about**, because four failed invisibly. The editor runs a script as one transaction, so each failure rolled back the fifteen statements before it and left the database untouched — while the accounts page could only report that the presets table was empty, which was true and was not the reason. The causes in order: a rewrite dropped the `add column drawdown_type` statement while keeping every reference to it; `product` and `payout_lowers_mark` were in the required half of a select, so a half-applied schema 400'd the whole query and printed "prop accounts are not set up" over nineteen working accounts; and finally `profit_target` was `numeric not null`, which refused the twelve Intraday and EOD rows that deliberately carry no target. **Confirmed by the seed reading back**: sixteen rows, with $25k, $50k, $100k and $150k each appearing under more than one product at different drawdowns. What is NOT confirmed is any account being classified — nothing was backfilled, so every account still carries a null product until somebody names it |
| `profile-avatars.sql` | 17 Aug 2026 | `profiles.avatar_path`, plus three storage policies for `avatars/<own id>/`. **Column confirmed from outside with two controls**: `?select=avatar_path` answers `200 []`, `?select=avatar_nope` answers `400 42703`, and `?select=last_seen_at,avatar_path` still answers `200 []` — so the column exists and the earlier one was not clobbered. **The storage policies are confirmed too**, on 17 Aug, by the only test that could do it: a member chose a picture and it uploaded, saved and rendered. No outside probe could show this — an anonymous upload is refused whether or not a member policy exists. What is still unshown is the *narrowness*: that a member is refused writing into somebody else's folder |
| `funded-accounts.sql` | 17 Aug 2026 | `funded` as a kind, four payout columns and `from_account`. **Columns confirmed from outside with a control**: all five named together answer `200 []`, while `payout_nonsense` answers `400 42703`. **The constraint is NOT confirmed, and cannot be from outside** — inserting `kind='funded'` and inserting `kind='not_a_kind'` both answer `42501`, because row-level security refuses the write before the CHECK is ever evaluated. The two are indistinguishable to an anonymous caller, so the only proof is picking **Funded** in the dropdown on a card and having it save |
| `trade-review-dismissals.sql` | 17 Aug 2026 | Lets a mentor set a shared trade aside without answering it. The dismissal **expires** — it only holds while it is newer than the member's last edit and their last message, so a follow-up comes back on its own and nothing needs tidying up. **Confirmed from outside the same day, with two controls**: the table with all four columns named answers `200 []`; a table that does not exist answers `404 PGRST205`; a column that does not exist on the real table answers `400 42703`. The first says the table is there and RLS holds, the second says `200 []` is not PostgREST shrugging, and the third says the four columns are real rather than ignored. What none of it shows is a **member** getting nothing from it — RLS does not apply to the table owner, so that needs a second signed-in account |
| `member-last-seen.sql` | 13 Aug 2026 | Adds `last_seen_at` to `profiles`. **Confirmed from outside the same day**: signed out with the publishable key, `?select=last_seen_at` answers `200 []` while `?select=not_a_real_column` answers `400` with `42703 column profiles.not_a_real_column does not exist`. The control is what makes the pass mean something — without it, `200 []` is equally consistent with PostgREST ignoring an unknown column. So the column exists and the policy holds. What it does **not** show is anything writing to it: that needs a members page opened while signed in, and the Accounts tab is where it shows up |
| `trade-reviews-thread.sql` | 13 Aug 2026 | Three policies, no schema change, letting a member write on their own trade while it is shared. **Not independently confirmed** — the proof is a Send under a shared trade in the journal that does not report a row-level security violation. The refusals matter more than the success and cannot be checked from the SQL editor at all, because RLS does not apply to the table owner: see the four things to watch in `HANDOVER.md` |
| `trade-reviews.sql` | 12 Aug 2026 | The mentor's answer to a shared trade, in its own table. **Confirmed from outside the same day**: signed out, with the publishable key only, `trade_reviews` answers `200 []` — the same signature as `trades`, which is a table that exists behind a policy that holds. A table that does not exist answers `404 PGRST205` and names itself, which is exactly the error the reply box was reporting beforehand. What that does *not* prove is the policies: an admin writing a reply and the member reading it back needs two signed-in sessions, and is in the **Untested** section of `HANDOVER.md` |
| `journal-media-privacy.sql`, and `storage.sql` re-run after it | 12 Aug 2026 | Journal screenshots stop being readable by every other member. **Verified by attack the same day**: one admin, one path string, minutes apart — a `signedUrl` while the trade was shared, `Object not found` once the member unticked it. Nothing changed in between but their checkbox. `HANDOVER.md` has the evidence and the five wrong-looking errors that fooled four earlier attempts |
| `trade-chart-url.sql` | 12 Aug 2026 | Adds `chart_url` to `trades`. **Confirmed by the result**: a chart renders on the Review tab, and nothing but this column can produce one. It also unblocked saving from the journal form at all — `readForm` sends the key on every save, so the form had never once saved successfully before this |
| `prop-attempts.sql` | 12 Aug 2026 | One account, several lives. **Not independently confirmed** — an Attempts section on each card in `props.html` is the proof, and until one is seen the backfill has not been shown to have run |
| `account-kind.sql` | 11 Aug 2026 | Adds `kind` to `prop_accounts`: prop, live or demo. Without it every account is treated as an evaluation, and a live account gets a target it can never have. **Not independently confirmed** — `props.html` reads the column, so a card offering the prop/live/demo choice is the proof |
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
