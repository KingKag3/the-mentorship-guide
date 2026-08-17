# SQL waiting to be run

A running list. Everything here is written, committed and **not yet applied** to the Supabase
project. Paste into the SQL editor, run, then move the line down to Done with the date.

Every migration in this repo is idempotent and safe to re-run, so if you are unsure whether one has
already gone in, running it again costs nothing. That is a deliberate property, not a coincidence —
see `CLAUDE.md`.

---

## Waiting

| File | What it does | Why |
| --- | --- | --- |
| `wealthcharts-refold-cleanup.sql` | Removes WealthCharts rows the corrected fold does not produce, then you re-import | The importer now pairs every round turn in a bucket, so re-importing brings back what was missing — but it cannot remove what was wrong: those rows carry an `external_id` the fixed fold never produces, so the upsert has nothing to overwrite |

**It has a SELECT at the top. Run that first and read it.** It reports, per row,
whether the trade is shared, carries notes or a chart, or has a mentor reply. If
any of those come back true, stop — a trade that never existed having a
conversation on it is worth understanding before it is deleted.

**Do not erase the journal instead.** `trade_reviews` references `trades` with
`on delete cascade`, so wiping it destroys every mentor reply attached — including
the thread tested on 17 August — along with `shared_with_mentor`, `chart_url` and
any notes typed onto an imported row.

The match is inverted on purpose: *anything on these nineteen accounts, in
WealthCharts' id format, that the corrected fold does not produce.* A list of
known-bad ids would only cover the exports in hand, and anything left by an
earlier import would survive it while being wrong in exactly the same way.
Hand-logged trades have no `external_id` and are never matched.

The privacy migration that was outstanding here has been applied *and* shown to work — see
**Verified by attack** in `HANDOVER.md` for what was observed, and for the errors that look like a
pass and are not.


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
