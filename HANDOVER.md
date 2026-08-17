# Handover

State of the members-area build. Written for whoever picks this up next, including a fresh session
with no memory of how any of it got here.

Last updated: 11 August 2026, seventh session.

## Seventh session — 11 August 2026, overnight

### Run these three, in any order

| File | What it does | Consequence of not running it |
| --- | --- | --- |
| `supabase/trade-closed-at.sql` | Adds `closed_at` to `trades` | Hold-time panels say "not enough trades carry a closing time". Nothing breaks |
| `supabase/risk-settings.sql` | Per-account stated risk, so R works without a stop | The R toggle stays unavailable for imported trades. Nothing breaks |
| `supabase/profiles-self-service.sql` | **Already run** on 10 Aug | — |

Then **re-import the mock CSV**. The upsert matches on `external_id`, so it corrects the existing
rows in place and fills in `closed_at` rather than duplicating anything. Regenerate the file first
with `python tools/make-mock-trades.py` if it has been overwritten — the current one carries a
disposition effect and tilt that the older one did not.

### What the statistics page does now

Four things that did not exist, all working on imported trades with **no tagging**, which is the
whole point: seven of the eight original breakdowns key off model, session and PD array, and those
exist only when a trade is hand-logged. Nobody hand-tags a hundred and seventy imported rows.

- **What your journal says** — findings in sentences rather than charts, ranked by money involved
  rather than by how neat they are, each carrying the number it came from and a link to the lesson
  that covers it.
- **Behaviour** — hour of day, position within the day, the trade taken straight after a loss
  (same-day only, since a fresh morning is not a reaction), and how long winners are held against
  losers.
- **Is any of this real** — a Wilson interval on the win rate, the average trade's distance from
  zero in standard errors, a 3,000-run bootstrap, and a losing run compared against chance.
- **Dollars or R** — chosen by the member, defaulting to whichever the journal covers.

### The maths is tested, which is new for this repo

`analytics.js` holds every calculation as a pure function. `tools/check-analytics.py` builds a page
that runs all of them against values computed independently in Python — different language, different
route to the same numbers, so agreement means something. **29 checks, all passing.**

There is no JavaScript runtime on either machine, so this is the only way any of it could be
verified at all. The bootstrap is seeded on both sides with MINSTD rather than the obvious glibc
constants: `1103515245 * 2^31` is past `2^53`, so JavaScript rounds it and the two languages then
disagree for reasons unrelated to the code under test.

### Quality of life, added the same night

- **Export.** The journal exports every trade as CSV — all of them, not the five hundred on screen.
  It reads back into the importer with no manual mapping. Import had existed since the beginning and
  export never had, which is the wrong way round for something a member puts three months of work
  into.
- **Honest row limits.** Three pages silently capped at 500, 2,000 and 5,000. Each now fetches one
  over the cap purely to detect truncation and says so. Statistics computed on a silently truncated
  set are worse than none — they look authoritative while describing a period nobody asked about.
- **Last 30 / last 90 / everything** on the statistics page, with every count respecting the window.
  All-time was the only view and is a poor answer to the one question a member has after three
  months.
- **`tools/check-tdz.py`.** Finds a `const` read during setup before it is declared — the failure
  that has killed `stats.html` three times. Its first version reported all eighteen pages clean while
  one was broken, so it self-tests on every run and refuses to report anything if the self-test
  fails. `tools/prove-tdz-rules.py` pins the rules that stop it crying wolf.

### Verified on 11 August, and it works end to end

**The statistics page renders and the findings are correct.** Seen signed in, against the re-imported
mock journal. Every finding matched a pattern deliberately buried in the fixture, at the value it was
buried at:

| Finding on screen | Seeded as |
| --- | --- |
| Holds losers **3.6 times** as long as winners | 3.6x |
| **62** trades after a loss at **-$187.82**, against -$3.66 after a win | 62, -$188, -$4 |
| 10:00 carrying **+$4,485** against -$8,605 for the quarter | the good hour |
| The fourth trade onwards at **-$202.14** across 28 trades | the overtrading tax |

That is the whole chain agreeing: importer, `closed_at`, `analytics.js`, the findings engine and the
lesson links. Hold times appearing at all is proof `trade-closed-at.sql` ran and the re-import
landed, since nothing else populates that column.

### Still unverified

- **`risk-settings.sql`** went in the same paste as `trade-closed-at.sql` and has not been
  independently confirmed. The R toggle showing is not proof; the table is only touched when the risk
  panel is saved. Save a figure there once and it either works or names the missing table.
- **The admin side of the account work** — editing another member's name, and the send-reset button.
- **The four Pine scripts** in the other repo. See `PASTE-THESE.md`.

## Sixth session — 10 August 2026

### Custom SMTP is a launch blocker, and nothing in the code will tell you

Testing resets produced `email rate limit exceeded`. That is Supabase's built-in email service, which
is throttled to a handful of messages an hour and is documented as **not for production use**. It is
shared infrastructure with no deliverability guarantee.

Left as it is, real members hit this the moment more than a couple sign up or reset in the same hour.
The failure is silent from their side: they request a link, no email arrives, and nothing on the site
is wrong. Every auth email the project sends goes through it — sign-up confirmation, reset, invite.

The fix is a custom SMTP provider under **Project Settings → Authentication → SMTP Settings**
(Resend, Postmark, SES — any of them). Once that is set, **Auth → Rate Limits** governs the ceiling
instead, and it can be raised.

Until then, testing an email flow means waiting out the throttle. No amount of retrying helps, and
retrying is what triggers it.

- **`supabase/profiles-self-service.sql` is run, and the guard is verified by attack.** Signed in as
  an ordinary member, in the browser, through the real client:
  `supabase.from('profiles').update({ role: 'admin' }).eq('id', user.id)` returns **403** with
  *"Only an admin can change a role"*.

  That single result confirms both halves. The message is the trigger's own, not a row-level-security
  rejection — so the `update own profile` policy is live (the request reached a trigger at all) and
  the column guard is what stopped it. A member cannot promote themselves, and the refusal happens in
  Postgres rather than in JavaScript.

  **The SQL editor cannot run this test.** It has no user session, so `auth.uid()` is null, the
  `where` matches nothing, and it reports success having attempted nothing. It has to be run from a
  signed-in browser.

- **Verified as an ordinary member:** saving a display name persists, and changing a password from
  `account.html` while already signed in works.

- **NOT verified, and known broken at first attempt: the reset email round trip.** The link in the
  email lands on the **sign-in page**, not on `account.html`, despite `redirectTo` naming
  `account.html` explicitly.

  **It was not the allow-list.** That was the first guess and it was wrong — the wildcard
  `https://kingkag3.github.io/the-mentorship-guide/**` was already present, and the code builds
  `https://kingkag3.github.io/the-mentorship-guide/account.html`, which matches it.

  **The redirect is baked into the email at send time.** A link generated before the `account.html`
  change deployed carries `redirect_to=.../login.html` and always will, however many times it is
  followed and whatever the code says now. The same is true of a reset requested from a cached copy
  of `login.html`. Testing a reset flow therefore means requesting a *fresh* link after a hard
  refresh; an old email in the inbox is testing an old build.

  `login.html` forwards a recovery landing to `account.html` regardless, so stale links work too —
  but only once the new `login.html` is the one the browser has.

- **Still untested:** the admin side — editing another member's display name in the accounts table,
  and the per-row send-reset button. Both use paths the member side has now exercised (the same
  `profiles` update, the same `resetPasswordForEmail`), which is a reason to expect them to work and
  not a reason to call them tested.

- **`supabase/curriculum-prerequisites.sql`** — run 10 August 2026. It moves the seven arrays
  lessons out of `phase-2` into a new `prerequisites` section between Phase 1 and Phase 2, renumbers
  the phases in tens so there is room to insert again, leaves `phase-2` empty and **unpublished** for
  its real content, and prepends a diagram to each of the seven lessons. Safe to re-run; each figure
  is guarded on the lesson not already having one. The check query is commented at the foot of the
  file.
- **The seven diagrams were verified before they went into SQL**, in the browser, against both
  themes: no missing classes, no colour literals, and the palette genuinely changes between light and
  dark. What has *not* been verified is how they look once rendered through `lesson.html`, because
  that needs the migration run and a login.
- **The calendar's colours were wrong, not merely ugly.** The redesign remapped `--accent` from green
  to the brand red and three rules still used it to mean "up", so every winning day printed its
  number in the losing colour. Fixed, along with the hardcoded cell backgrounds that had no
  light-mode value. The calendar grid is now on `design.html`, whose absence is why this survived.

### The concept-page diagrams are wrong in light mode

Not fixed, and worth knowing before anyone reports it as new. `style.css` states the rule — a diagram
must never carry a hex, or it will be wrong in one of the two themes — and the six public concept
pages break it **147 times**, because they were drawn before light mode existed.

| Colour | Uses | What it does on a white page |
| --- | --- | --- |
| `#4ade80` | 60 | Bright green, roughly 1.7:1. Readable as a shape, poor as text |
| `#f87171` | 37 | Same problem, salmon |
| `#8b98a5` | 18 | Mid grey. The one that survives both |
| `#fbbf24` `#60a5fa` `#c4b5fd` | 39 | Pale on white, acceptable as fills |
| `#d7dde3` | 6 | **Near-invisible.** This is the acute one |
| `#12171d` `#232b33` | 5 | Near-black; reads, but is not theme-aware |

The `svg-*` classes to convert them to already exist and are proven by the seven new figures. It is
mechanical work, not design work.

## Since the last update — fifth session

> **All migrations are run.** Verified from outside the application with the anon key: every column
> the journal, calendar and importer write resolves, and `trade_exits` exists with the expected
> shape.
>
> | File | State |
> | --- | --- |
> | `supabase/trades.sql` | run |
> | `supabase/trade-exits.sql` | run — `fees`, `trade_exits` |
> | `supabase/trade-accounts.sql` | run — `account`, `net_pnl` |
> | `supabase/trade-import.sql` | run — `external_id`, `imported_at` |
> | `supabase/settings.sql` | run |
> | `supabase/scripts.sql` | run |
> | `supabase/trade-import-fix.sql` | run — the import upsert works |
> | `supabase/curriculum-arrays.sql` | run 10 August 2026 — content, not schema |
>
> What that check *cannot* see: whether the partial unique index on `(user_id, external_id)` was
> created, because indexes are not visible to the anon key. The importer's de-duplication depends on
> it. Importing the same file twice is the test — the second run should leave the trade count
> unchanged. (`trade-import-fix.sql` has since replaced that index with a plain one, because a
> partial index cannot be named by an upsert — see `DECISIONS.md`.)
>
> `curriculum-arrays.sql` is **verified from inside**, 10 August 2026, which the anon key cannot do —
> `phases` and `lessons` answer 200 with `[]` to it, proving only that the policies hold. Queried as
> the owner: phase `phase-2` exists and is published, all seven lessons are present, none orphaned,
> none unpublished, and seven are visible under the phase. The seeding is sound.
>
> `supabase/curriculum-arrays-check.sql` is the query, kept because the three ways this can look
> broken need three different fixes and the counts tell them apart in one read.

- **`trade-karma-htf.pine` compiles clean.** Confirmed in the editor, no errors. The largest
  concentration of unverified code in the project is down to `trade-karma-pd-arrays.pine`, which has
  not been through the editor since the 2022-model block, session shading and label rework landed.
- **`tools/lint-pine.py`** in the pine repo checks the traps that have actually bitten. All four
  scripts pass, which is not the same as compiling.
- **The journal records how a trade came off.** Fills are rows — quantity, price, a note — and their
  weighted average is written back to `exit_price`, so points, R, the statistics and the calendar
  keep reading the columns they already read.
- **Trades carry an account, and an optional reported dollar result.** `net_pnl` wins over the
  derived figure when present, and a trade logged as a dollar figure alone now counts with no prices
  at all. Both are kept and the journal says when they disagree.
- **`calendar.html`** is a month grid of green and red days, in dollars or R, filterable by account
  with a per-account breakdown.
- **Ticks and dollars** are derived and shown in the form as you type and in the trades list.
  `CONTRACTS` moved from `sizer.html` into `app.js` so no two pages can disagree about what a point
  is worth.
- **The pre-trade checklist moved to the top of the form**, and the date field has a visible picker
  — `color-scheme: dark` was never declared, so the native calendar icon was drawn dark-on-dark.
- **A missing migration now names its own SQL file** rather than showing a raw Postgres error.
- **[IMPORTS.md](IMPORTS.md)** is research on how each platform exports trades. Nothing in it is
  verified against a real file yet.

## Since the last update — fourth session

- **`admin.html` is tabbed**: Accounts, Invites, Indicators, Phases, Entries. One page, one auth
  check, one load — the tabs only decide what is visible, so nothing refetches on a switch and a
  half-filled form survives moving away and back. A hash deep-links a tab and beats the remembered
  one.
- **The indicators page can carry an install walkthrough video**, set from the admin page rather
  than hardcoded. New `settings` key/value table; `supabase/settings.sql` **has been run and
  verified** — the table resolves, an anonymous read returns `[]` rather than an error, and an
  anonymous write is refused with 401.
- **The admin indicators table shows an Added column**, created date and time plus the updated date
  when it differs. `updated_at` is the field the members' "new" badge compares against, so
  re-pasting a source re-flags it as new for everybody — there is currently no way to fix a typo
  without re-notifying.
- **Slugs are normalised on save.** `TK - HTF Candles` and `TK-HTF` were two rows because the unique
  constraint saw two different strings. Existing rows keep their slugs until re-saved.
- **`tools/lint-pine.py` in the pine repo** checks the traps that have actually bitten: CE10156
  dangling continuations, CE10123, missing version line, duplicate declarations, non-ASCII in
  runtime strings, nested declarations, bracket balance, security-call count. All four scripts pass.
  That is not a compile.

## Since the last update — third session

- **The site is Trade Karma now.** Masthead, titles, footers, docs. "Smart Money" survives in 18
  places as the name of the *subject*, which is deliberate — the glossary and the credit line depend
  on it meaning something. Do not run a blanket replace on it.
- **The indicators are Trade Karma too**, and the pine repo has no occurrence of the old term
  outside `knowledge/sources.md`, where two cited book titles keep it because renaming a citation
  falsifies it.
- **Three distributed scripts now**: `trade-karma-context.pine`, `trade-karma-pd-arrays.pine`,
  `trade-karma-htf.pine`. The day model stays private.
- **`scripts.html` ships indicators to members**, source held in the `scripts` table rather than as
  a file. `supabase/scripts.sql` has been run.
- **Tools appear on every tool page** as a rail, and the members index flags new indicators.
- **There is a second live branch, `ui-overhaul`.** Will Jedrzejczak is rebuilding the visual system
  on it — `style.css`, `design.html`, page markup, plus `theme.js` and `contents.js`. It merges when
  Kag3 decides, on no schedule. **Before touching `style.css` or `design.html` on `main`, read the
  redesign section of `ROADMAP.md`**: presentation belongs to that branch, behaviour belongs here,
  and a careless change on either side lands as a conflict in a three-thousand-line stylesheet.

---

## Built and pushed

| Page | Gated | Needs Supabase | Verified |
| --- | --- | --- | --- |
| `sizer.html` | no | no | yes — in a browser |
| `journal.html` | member | yes | no |
| `stats.html` | member | yes | no |
| `clock.html` | no | no | yes — in a browser |
| `smt.html` | no | no | yes — in a browser |

`supabase/trades.sql` **has now been run against the live project.** Verified from outside the
application, with the anon key: the `trades` table exists, an anonymous select returns `[]` rather
than rows, and all 26 columns `journal.html` writes are present with no mismatch. So the SQL parses,
the table shape matches the insert, and the row-level security is not accidentally open.

That is as far as verification goes. Whether a row actually lands, and whether `points` and
`r_multiple` compute correctly, cannot be checked from outside — the policies correctly hide member
rows from any key the site holds. It needs an authenticated session.

---

## Decisions made without asking

The user was asleep. These went the way that seemed most defensible; all are cheap to reverse.

**The sizer, clock and SMT checker are ungated.** They hold no private data and live in a public
repository, so a login on them would be decorative in exactly the way `README.md` already describes
for the concept pages. They also work as a funnel. If they should be members-only, add
`requireRole(['member','admin'])` and an `#auth-root` div — about four lines each.

**Points and R are derived, never typed.** The journal computes both from entry, stop and exit and
writes them read-only. A journal where a member can enter an R that disagrees with their own prices
produces statistics that mean nothing, and the statistics are the entire point of the journal.

**Only closed trades count in the statistics.** A trade with no exit has no result; counting it as
zero would drag every average toward nothing. Open trades still show in the journal, tagged `open`.

**Thin slices are marked, not hidden.** Anything under ten trades gets an `n=` tag rather than being
suppressed, so a member sees the sample is too small instead of wondering where a category went.

**The members index now opens with the tools, then the curriculum.** The tools are what somebody
returns for daily; the curriculum is what they read once.

---

## Untested

Be honest about this list before trusting anything below it.

- **The screenshot upload and the `journal/<user id>/` storage policy** — unexercised unless an
  image has been attached. Still assumes `(storage.foldername(name))[1]` is the first path segment.
- **`supabase/journal-media-privacy.sql` — applied and verified on 12 August 2026, and no longer on
  this list.** The record of what was actually observed is under **Verified by attack** below. It
  stays named here because four earlier attempts to test it produced errors that looked like passes,
  and anybody re-checking it should read that section before trusting a red console line.
- **`supabase/trade-reviews.sql` — run on 12 August 2026. Half the policies are now observed.**
  Signed out, with the publishable key only, `trade_reviews` answers `200 []`, which is the
  signature of a table that exists behind a policy that holds — a table that does not exist answers
  `404 PGRST205` and names itself, which is what the reply box was reporting an hour earlier.

  Two of the four unknowns were settled on **13 August 2026** by a screenshot of a member's own
  journal: a trade tagged *shared*, with *"Mentor — 8/13/2026, 8:52:06 AM"* and the reply body
  rendered beneath it. That is an admin insert on a shared trade **and** the member reading it back
  on their own — items 1 and 3 below, both of which had never returned a row.

  Two remain, and both are the attacking half:

  2. An admin being *refused* on a trade nobody shared. Worth attacking, because a permissive insert
     policy would let a mentor write on any trade in the system and nothing in the UI would look
     wrong.
  4. A *different* member not being able to read it.

  What *was* verified on 12 August 2026, in a browser against the shipped source rather than a
  retyping of it: `admin.html`, `journal.html` and `design.html` all parse, and `isWaiting()` was
  lifted out of `admin.html` and run against seven fixtures — no replies, answered after the last
  edit, edited after being answered, answered at the same instant, an empty array rather than an
  absent one, a missing `updated_at`, and a two-reply list proving the newest-first order is what
  gets compared. All seven behave as intended.

- **`supabase/trade-reviews-thread.sql` — run on 13 August 2026, behaviour not yet observed.** Three
  policies, no schema change, letting a member write on their own trade while it is shared.

  `isWaiting()` was lifted out of `admin.html` again and run against nine fixtures covering every
  order a thread can arrive in, plus a mentor writing on their own shared trade. All nine behave as
  intended, and the run prints what the **old** rule said beside the new one — on *member answered
  back* the old rule returns *answered*, which is the regression this migration exists to close: a
  member's reply was the newest row, so it marked their own question answered and the mentor never
  saw it.

  **Four things to watch the first time somebody writes**, each of which fails quietly rather than
  loudly:

  1. A member writing on their own shared trade. Must succeed.
  2. A member writing on a trade they have **unshared**. Must be refused — the box is hidden, which
     is not a defence.
  3. A member writing on somebody **else's** trade. Must be refused. This is the one worth attacking
     and it cannot be checked from the SQL editor, because RLS does not apply to the table owner.
  4. Whether their reply actually puts the trade back in the mentor's queue, which depends on
     `created_at` landing after the mentor's message on the same server clock.

- **`editor.js` — the reply editor, never used against a live database.** Editor.js ran here for one
  afternoon and was moved back; see `DECISIONS.md` for why and `ROADMAP.md` for where it went
  instead. The box is the local editor again: WYSIWYG on screen, Markdown in the column, no network
  dependency.

  Verified in a browser after the revert: 29 checks — the Markdown round trip, the toolbar driven
  the way a person drives it (bold from a selection, bullets across two paragraphs), the toolbar's
  active states including the false-italic case a blockquote used to cause, and eight hostile
  inputs through both readers.

  **`renderBody()` is the one thing kept from the experiment**, and it is not dead code. Any reply
  written during that afternoon is an Editor.js JSON document, and without this it would render as
  a wall of raw JSON — which reads as though the sender typed it. Whether any such row exists is
  unknown and nobody needs to find out; the reader costs nothing and the lessons migration will
  want it.

  **What has never happened: a message going through Postgres.** Worth one send containing a bold
  word, a bullet list and a link, read back on the other side.

- **`last_seen_at` — the column is confirmed, and nothing has been seen writing to it.**
  `supabase/member-last-seen.sql` ran on 13 August 2026. Signed out with the publishable key,
  `profiles?select=last_seen_at` answers `200 []` while `?select=not_a_real_column` answers `400`
  with `42703`; the control is what makes the pass mean anything, since `200 []` on its own is
  equally consistent with an unknown column being ignored.

  That settles existence and the read policy. It settles nothing about the write, which is silent
  by design: `touchLastSeen` in `app.js` is unawaited and swallows its own errors, because the least
  important write on the site sits on the critical path of every members page.

  The consequence of that design is that **nothing will tell you it is not working.** The proof is
  the Accounts tab: open any members page while signed in, then look at Accounts — that account
  should read *today*. If it does not, the throttle stamp is the first place to look —
  `localStorage['member_last_seen_stamp:<user id>']` holds a date, and clearing it forces the next
  load to write again.

  The maths is verified: 18 checks over `daysAway` and the attrition counts, including the boundary
  cases (7 days is active, 8 is not; 30 is not lapsed, 31 is), a stamp at 23:50 last night reading
  as one day rather than eleven minutes, and a clock skew putting the stamp in the future clamping
  to zero rather than going negative. The Accounts table was rendered with a fixture covering every
  cell wording, and the missing-column fallback was exercised.

- **`trade-review-dismissals.sql` — run on 17 August 2026, and the table is confirmed.**
  Signed out with the publishable key: the table answers `200 []` with all four columns named, a
  table that does not exist answers `404 PGRST205`, and a column that does not exist on the real
  table answers `400 42703`. Three probes, because one on its own proves nothing — the middle two
  are what stop `200 []` meaning "PostgREST ignored you".

  It lets a mentor take a shared trade out of the queue without answering it. Admin-only in every
  direction; **no policy lets a member read it**, because "your mentor decided not to answer this"
  is unkind and tells them nothing they can act on.

  The maths is verified: 22 checks over the rule, including both directions of expiry — a trade set
  aside then edited comes back, a trade set aside then written to by the member comes back, and a
  trade set aside then written to by the *mentor* stays out. Plus the four-way partition: every
  shared trade lands in exactly one of Waiting, Replied and Set aside, nothing is counted twice and
  nothing is lost. A trade answered *and then* set aside shows under Set aside, because the
  dismissal is what is holding it out.

  **Exercised end to end on 17 August 2026, across two signed-in accounts** — the first time
  anything in the mentor loop has been. Observed in order: *no reply needed* moved a trade into Set
  aside; the mentor then wrote on it and it **stayed** in Set aside, which is the clause saying a
  mentor acting is not the member needing something; then, signed in as the member, a reply put it
  **back into Waiting on its own**. That is the expiry rule working in both directions against a
  real database rather than a fixture.

  **And one bug the same test found, on 17 August.** Pressing *no reply needed* a second time - on
  a trade that had been set aside once, then replied to by the member - did nothing at all. The
  page sent `{ trade_id }` alone and left `dismissed_at` to its column default, which is right for
  an insert and wrong for an upsert: a DEFAULT applies only when a row is created, and PostgREST's
  merge-duplicates writes `ON CONFLICT DO UPDATE SET` for exactly the columns in the payload. So
  the update set `trade_id` to itself, kept the stale timestamp, and the dismissal had already
  expired against the member's newer message. The request succeeded; nothing moved. The page now
  sends `dismissed_at` and `dismissed_by` explicitly, and failures are reported beside the button
  rather than in `#review-count`, which sits above the tabs and is off-screen from a card halfway
  down the list.

  **Still not shown:** that a member gets nothing at all from the dismissals table. RLS does not
  apply to the table owner, so the SQL editor cannot answer it — it wants the member's own client
  asking for `trade_review_dismissals` and getting `[]`. The two accounts are already set up, so
  this is one console line away.

- **Whether a member who is not an admin is refused.** Not run directly, and not planned. An admin
  holds every grant a member holds and one more, so the admin being refused an unshared object means
  a member is too — their grants are a strict subset. Recorded as reasoning rather than as an
  observation, because that is what it is.
- **That the owner never lost anything.** `kj` read their own trade row after the migration, which is
  the table and not the bucket. Nobody has signed a URL for their own screenshot since, and no lesson
  page with an uploaded image has been opened since either. Both go through the same bucket and the
  same helper, so both are worth one look. Expected outcome is boring, which is exactly why it has
  not been done.
- **`admins read shared`, and the whole Review tab with it** — **exercised on 12 August 2026**, for
  the first time since the policy was written. `kj@lanline.com` ticked *share with mentor* on trade
  2950 and the admin's Review tab rendered the card, the levels grid and the screenshot. Before this
  the policy had never returned a row. What is still only markup: the levels grid and copy button
  against a trade with a stop and a target filled in, since 2950 has neither.
- **`chart_url` and everything hanging off it.** `supabase/trade-chart-url.sql` has not been run, so
  the column does not exist yet and saving a trade will fail until it does — the journal names the
  file rather than failing silently, because `migrationHint` now knows it. What *was* verified on
  12 August 2026: `chartLink()` against fifteen inputs including `javascript:` and `data:` URLs, both
  rejected; and the derived snapshot URL loading a real 894×579 image from TradingView's CDN, which
  is the mechanism the whole feature rests on.
- **The row-level ask toggle and the bulk share buttons.** Written, parsed, and never clicked against
  a database. Both write `shared_with_mentor` directly and redraw before the round trip returns, so
  the failure worth watching for is a toggle that looks like it worked and did not.
- **"Copy for TradingView" and the indicator it feeds.** `toPineTrades` in `app.js` emits the wire
  format that `trade-karma-my-trades.pine` reads in the private repo, and **the two have never been
  run against each other.** What was verified on 12 August 2026 is a round trip in a browser: the
  encoder's output parsed by a JavaScript transcription of what the Pine does to the string, written
  from the `.pine` source rather than from the encoder. That proves the two agree about the format;
  it does not prove the Pine compiles, and it cannot. `PASTE-THESE.md` in the pine repo lists the
  four pastes that would find a problem.

  The failure mode to watch for is not an error. The indicator cannot tell a stop from a target, so
  a field order that has drifted draws a plausible picture of a trade that never happened. Both
  files say so at the top.
- **The pre-trade checklist end to end.** The roll-up logic was run in a browser across all five
  states; the module load, the save-time confirmation and the value reaching the database were not.
- **Mobile layout.** `.tool-grid` and `.field-pair` have media queries but have not been looked at
  on a narrow viewport.
- **The new-indicator badge count.** The rendering is exercised; the count against real rows needs a
  signed-in session. Publish something and check the members index reads `new`.
- **The pine scripts are no longer on this list.** `trade-karma-pd-arrays.pine` compiled and ran on
  a live NQ 15m chart on 10 August 2026, with the unicorn scan, the A-12 validity tests, inversions
  and the draw panel all in it. `trade-karma-htf.pine` was confirmed clean earlier. What is still
  unverified about the array script is whether its *readings* are right, not whether it runs — see
  the note below.

### The blank members page — settled

The page rendered a heading, a footer and nothing between, with an empty account strip. Ruled out
in order: deployed `app.js` byte-identical to local, parses clean under node, every imported name
exported, and all four Supabase endpoints answering 200 in under a second.

The cause was `supabase.auth.getUser()` not settling — almost certainly a stored session that could
no longer be refreshed. Everything downstream was still awaiting it, so nothing had been written to
the page.

Auth calls before first paint now carry a twelve second deadline and write a placeholder before
their first `await`. **If a page is ever blank again, that is no longer a possible explanation** —
it will say what failed.

### The statistics question — settled

A trade was logged and `stats.html` showed nothing, which read as a broken insert. It was not.
Queried from the SQL editor, row `id 1` exists with `exit_price` null, therefore `r_multiple` null,
therefore correctly excluded. **The insert path works.** The empty-state message was the fault, and
it has been fixed.

**The derived arithmetic is now verified too.** `derive()` was run in a browser against nine cases:
long and short wins, full stops and breakevens, a missing exit, and entry equal to stop. All nine
produce the expected points and R, including the sign flip on shorts and the guard that stops a
zero risk yielding infinite R. This was the largest remaining risk on this list, because wrong
arithmetic here would have been invisible — every statistic wrong and every statistic plausible.

Note on the surviving test row: its prices are negative (`entry -0.5`, `stop -1.5`), which is not a
price any index future trades at. It came from clicking the number spinners down from empty. The
price fields now carry `min="0"`. The row is harmless but worth deleting before it reaches a
statistic.

---

## Verified by attack — journal screenshots, 12 August 2026

The hole was real and is closed. What follows is what was observed, not what was intended, because
this is the kind of fix that cannot be confirmed by looking at a screen.

**The setup.** `kj@lanline.com`, role `member`, owns trade 2950 with
`journal/d1b5b810-…/79fa58ef-….png` in `screenshot_path` and `chart_url` null — so the image on the
Review card is the stored object and not a TradingView link. A separate admin account did the
reading. The path was never typed: both consoles fetched it from `trades` and printed it, and the two
printings matched.

**The A/B, and it is the whole proof.** Same admin, same browser tab, same path string, minutes
apart:

| `shared_with_mentor` | Result of `createSignedUrl` |
| --- | --- |
| ticked | a `signedUrl` |
| unticked | `{ data: null, error: 'Object not found' }` |

The only thing that changed between them was a member ticking a box in their own journal. That is
what makes it a proof rather than a coincidence: a wrong path would have failed in both states, and
it succeeded in one.

`select policyname, permissive, cmd from pg_policies` confirmed the shape underneath it — three
permissive SELECT policies and `journal media is owner only | RESTRICTIVE | SELECT`.

**The trap, which caught four attempts before any of this.** The test looks for an error, and four
different mistakes produced errors that were not the one being looked for:

| What came back | What it actually meant |
| --- | --- |
| `syntax error at or near "await"` | JavaScript pasted into the SQL editor |
| `supabase is not defined` | it is an ES module export, not a global |
| `Promise {<pending>}` | the call was never awaited |
| `Invalid key: journal/…/….jpg` | a placeholder or ellipsis left in the string |
| `Cannot read properties of null / undefined` | the path variable was empty or the tab had reloaded |

**Only `Object not found` is the pass**, and it is also what a mistyped path returns. Nothing else
counts. This is why the A/B above uses one string in two states rather than two strings — it removes
the failure mode that every one of those five errors belongs to.

**Re-checking it later**, as one paste, in an admin console, with the trade unticked:

```js
(async () => {
  const s = await import('./app.js');
  const P = 'journal/<uid>/<uuid>.png';
  const shared = (await s.supabase.from('trades').select('id')
    .eq('shared_with_mentor', true).not('screenshot_path', 'is', null)).data;
  const signed = await s.supabase.storage.from('lesson-media').createSignedUrl(P, 60);
  console.log({ sharedVisible: shared.length, gotUrl: !!signed.data,
                error: signed.error && signed.error.message });
})()
```

`{ sharedVisible: 0, gotUrl: false, error: 'Object not found' }` is the pass. `gotUrl: true` with
`sharedVisible: 0` is the bug back. Capture the path while the trade is still shared — unticking
takes the row away from the admin too, and then there is nothing to sign with.

---

## Known gaps

- **`models.html` does not link to "your results with this model."** The roadmap calls for it and
  `stats.html` has the data to serve it. Left until the statistics are proven against real rows —
  linking members at a page that may be miscounting would be worse than not linking at all.
- **The tools are unreachable from the public site.** `DECISIONS.md` justifies leaving the sizer,
  clock and SMT checker ungated partly because they work as a funnel. Nothing on `index.html` or any
  concept page links to them, so as shipped they funnel nobody. Either link them or drop that half
  of the argument.
- **`design.html` covers the tool components but not all of them.** The Quill editor overrides, the
  invite components, the lesson-media components and the auth card are still absent.
- **`trade-karma-day-model.pine` cites no rule IDs.** `CLAUDE.md` in that repo says the code cites
  them in comments. `trade-karma-context.pine` now does — it was written to set the convention — but
  the day model still has zero. The variable map in `implementation.md` is accurate either way.
- **`conflicts.md` `Q-02` is unrunnable as written.** It says to toggle `gateCond`, which the RTH
  rewrite removed. `DECISIONS.md` and `implementation.md` both record that; `Q-02` itself was never
  updated and still reads as a live experiment.
- **The SMT checker is manual only.** Eight numbers typed by hand. A daily-bar version behind a
  Supabase Edge Function is the roadmap's version.
- **No CME holiday handling in the clock.** It knows the daily halt and the weekend, not holidays.

---

## Picking this up on another machine

```
gh repo clone KingKag3/the-mentorship-guide
gh repo clone KingKag3/the-mentorship-pine
```

`CLAUDE.md` in each repo loads automatically at the start of a session, so a fresh session already
knows the conventions and the traps. Read `DECISIONS.md` for why things are as they are.

### The prompt to open a session with

Paste this on a machine that has not worked on the project before, or after a long gap. It is
written to make the session prove it has read the context rather than assume it.

> I'm continuing the mentorship project from a different machine. Before doing any work:
>
> **1. Get both repos current.** `KingKag3/the-mentorship-guide` (public — the static site and
> members area) and `KingKag3/the-mentorship-pine` (private, needs `gh auth login` — the TradingView
> indicators and the `knowledge/` rule base). Clone whichever is missing, pull whichever exists, and
> tell me the current HEAD of each.
>
> **2. Read these, in this order, properly.** `CLAUDE.md` in both repos. Then `HANDOVER.md` — the
> current state, what was assumed, and what has never been run. Then `DECISIONS.md` in both, which
> records what was decided *and what it was decided instead of*. Then `ROADMAP.md`. Then
> `knowledge/implementation.md` and `knowledge/conflicts.md` in the pine repo.
>
> **3. Report back before touching anything**, in your own words: what is built and verified, what is
> built and unverified, and what the next task is and why. If anything you find in the code
> contradicts what those documents claim, say so plainly rather than papering over it.
>
> Don't start building until I confirm. Once I do: commit and push after each piece, never describe
> untested code as working, and append to `DECISIONS.md` before the session ends.

For a short session on a machine already set up, this is enough:

> Pull both mentorship repos, read `HANDOVER.md` and both `DECISIONS.md`, and tell me where we left
> off before doing anything.

**Kag3 asked to be reminded about the Pine scripts.** Seven of them are written, linted and have
never been through the editor — the list, the order and what to check on each is in the pine repo's
`PASTE-THESE.md`. He set them aside on 11 August to work on prop accounts and asked for a nudge, so
this is the nudge: **start with `trade-karma-my-hours.pine`**, which is 128 lines with no market
logic and is the cheapest way to find out whether anything in the batch is broken in a way the
linter cannot see.

**First thing to do:** import the same Tradovate file twice. The first run proves the mapping; the
second proves the de-duplication, which is the only part of the importer that cannot be checked
without a live database. If the count doubles, the unique index in `trade-import.sql` did not get
created.

**Then:** log one closed trade by hand and confirm it reaches the calendar and the statistics. That
round trip is still unproven.

**Then:** judge what `trade-karma-pd-arrays.pine` is *saying*. It compiles and runs; nothing has yet
checked whether it is right. Two readings are worth an hour each:

- Do the `x2` tags land on a sensible minority of order blocks? Nearly all of them means `obRatio` is
  too loose to filter anything; nearly none means it is too strict to be useful.
- Does a gap price closed through actually flip and keep drawing, rather than fading?

**Adding it to a chart: remove the copy that is already there first.** This has now cost two separate
sessions. Pasting *into* the editor rather than over it leaves the old declaration and produces "your
script has 2". And adding a second instance without removing the first leaves both drawing — which
presents as boxes that will not go away when the indicator is toggled off, and reads exactly like a
frozen script. Pine drawings die with their script instance, so **anything still on the chart after
the indicator is removed was never drawn by it.** That test settles it in one click.

Three things to expect on `trade-karma-htf.pine` specifically, none of them errors:

- The panel draws roughly **100 bars to the right of the last candle** at default settings. If the
  chart is not scrolled or zoomed to show empty space after price, it looks like nothing rendered.
- It makes **30 `request.security` calls at runtime** — five in the source, but `drawTf` is called
  six times. The limit is 40, so a seventh timeframe would break it.
- At maximum settings (six timeframes, 40 candles each, all traces on) it needs **516 lines against
  `max_lines_count = 500`**. Pine drops the oldest silently, so candles would vanish from the left
  rather than erroring. Defaults use about 26.

If it fails to compile, suspect lines 130–137 first: they use the legacy `float[]` array syntax
rather than `array<float>`.

**Then:** apply the Supabase **Site URL** fix if it is still outstanding. `SETUP.md` step 4 now specifies it, but the setting
itself is in the dashboard and was still wrong at the end of this session — new members confirming
their email land on a 404. Emails already sent stay broken; affected accounts need a fresh
confirmation from **Authentication → Users**.

Then, in order: log one real closed trade and confirm the statistics page renders it — the
arithmetic is proven but the round trip through the database is not; link `models.html` to "your
results with this model"; and decide whether the tools should be reachable from the public site or
whether the funnel argument in `DECISIONS.md` should be dropped.

## Where the reasoning lives

- `CLAUDE.md` — loaded every session. The rules that must not be rediscovered.
- `DECISIONS.md` — what was decided, what it was decided instead of, and why.
- `ROADMAP.md` — what is worth building, in order, and what is deliberately excluded.
- `README.md` — conventions. Read the Conventions section before adding a page.
- The private `the-mentorship-pine` repo, `knowledge/` — distilled Smart Money rules with stable IDs,
  `conflicts.md` for where the source books disagree and which won, `implementation.md` for what is
  encoded in the indicator and what is still open.

The killzone times in `clock.html` came from that knowledge base rather than from either book
directly, because the two books disagree on two of them and `conflicts.md` records which reading
won and why.
