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

## Where it was left, 17 August 2026

`DESKTOP-6S0E97B` handed over at 16:36 with both repos level and nothing local.
The whole of 17 August went on two things.

**The community layer.** Attendance on the Accounts tab; a waiting-count beside
the Admin link on every members page; Waiting / Replied / Set aside / All tabs on
the review queue; setting a trade aside without answering it, with a dismissal
that expires the moment the member touches the trade again; a message of the day
on its own admin tab, with pictures that can be pasted, dropped and resized, and
that members can dismiss; profile pictures, with initials as the default rather
than a fallback. Four migrations, all run and confirmed.

**A real importer bug, found by Kag3 noticing three numbers disagree.** The
WealthCharts fold silently discarded 8,507.34 of losing trades. Fixed, verified
against the source, and the journal now matches WealthCharts to the cent on all
nineteen accounts: 914 trades, 61,302.50.

### The first thing to do on the other machine

**Pull both repos.** The guide is 25 commits further on than it was this
morning, and `editor.js`, `import.html`, `app.js`, `admin.html`, `members.html`
and `props.html` all changed. A stale checkout will not conflict — it will
quietly rebuild something that already exists.

### What is waiting, in the order it is worth doing

1. **The eight Pine scripts have never been compiled.** `my-hours` first: 128
   lines, no market logic, so it separates the environment from the code. This
   has been open longest.
2. **Six accounts belong to somebody else.** `APEX-247230-*` and `APEX-28074-*`,
   122 trades, −2,866.12. Almost certainly other members' — the owner-scoped
   count proves they are not Kag3's — but nobody has looked at the email beside
   them yet. **Do not delete anything on the strength of an account name.**
3. **`props.html` cards** settle three migrations still marked *not
   independently confirmed*, and the funded-account button has never been
   pressed.
4. **Custom SMTP is still a launch blocker.** Every auth email goes through
   Supabase's throttled built-in service, and the failure is silent from the
   member's side.

### The two hazards this day produced, both worth keeping

**The SQL editor connects as the table owner and ignores row-level security.**
A query there reads every member's rows, and a `delete ... where account in
(...)` reaches across the whole membership with `trade_reviews` cascading behind
it. Join `profiles` and name the owner.

**Export the whole range in one file.** WealthCharts exports are cumulative
snapshots; importing a run of them re-folds the same buckets every time, and a
changed pairing leaves the old row behind under a dead id.

---

### PostgREST returns a thousand rows and says nothing — 18 August 2026

**Supabase sets `db-max-rows` to 1000.** A `.limit(5000)` is not an error and produces no warning:
the request succeeds, a thousand rows come back, and the page draws them as though that were
everything.

Five reads were over that: the calendar at 5,001, the journal at 5,001 and its export at 20,000,
the statistics page at 2,001, and `props.html` at 5,000. **Every one had been reading a thousand
for as long as anybody had a thousand trades.** The statistics page was computing win rates,
Wilson intervals and a 3,000-run bootstrap over a truncated set while printing "showing the most
recent 2,000". `props.html` was measuring trailing drawdowns from a slice, which is the worst place
on the site to be quietly short of data.

It surfaced by accident. The calendar was flipped from oldest-first to newest-first so that
exceeding the cap would drop old trades rather than today's — and that moved which end fell off, so
11 August lost eight trades per account. 1,142 rows minus the thousand allowed is 142; spread over
that day's 450 it leaves 17 of 25 per account, which is exactly what appeared.

`fetchPaged` in `app.js` pages with `.range()` and reports `capped` only when the cap is genuinely
reached. It needs an ORDER on the query, not optionally: without one Postgres may return rows in any
order and two pages can overlap or miss. Verified against a stand-in that enforces the same
thousand-row wall — 10 checks including contiguity across 3,333 rows and an error on the second
page being surfaced rather than swallowed.

**Confirmed the same day.** With paging in place the calendar reads 1672 as 25/11/5/3/6/12 trades
across 11–18 August, totalling 4,102.70 — WealthCharts' Realized PnL for that account, to the cent,
with both week subtotals right.

**The lesson worth keeping: a limit is a request, not a guarantee.** Anything reading a table that
could exceed a thousand rows goes through `fetchPaged`.

**And one that cost a round trip either side of it: GitHub Pages serves `Cache-Control: max-age=600`.**
For ten minutes after a deploy a browser can keep the old files, and a normal reload will happily
reuse a cached ES module — so a fix that is live on the site is not yet live in the tab looking at
it. "Nothing has changed" after a deploy means hard-refresh or a private window before it means
anything else.

---

## Untested

Be honest about this list before trusting anything below it.

- **Nineteen accounts still carry a null product, so nothing on them is being checked.** 19 August
  2026. Every migration is applied and the presets hold sixteen rows, but nothing was backfilled —
  naming the product is a decision only the member can make, and until it is made the card looks up
  no terms at all. The drawdown mismatch warning is silent because there is nothing to compare
  against, not because the figures agree.

  **The one action outstanding:** on `props.html`, under *Set several at once*, pick **Legacy**,
  choose all nineteen and apply. Only Legacy offers $250,000, and both the $6,500 drawdown and the
  absence of a lock on the evaluations match it. Each unclassified card says this itself now.

- **A select naming a column from an unrun migration takes the whole page down.** 18 August 2026.
  `props.html` asked for `payout_lowers_mark`, which `account-adjustments.sql` creates — and that
  migration was then deliberately held back. PostgREST does not skip an unknown column, it refuses
  the query with a 400, so the accounts page rendered *"prop accounts are not set up"* over nineteen
  perfectly good accounts. **Two decisions that were each correct, met, and broke the page.**

  Now split into `ACCOUNT_COLUMNS` and `OPTIONAL_COLUMNS`, with one retry without the optional half.
  The page has always treated attempts and adjustments as features that might not be installed;
  account columns get the same treatment.

  **The general lesson, because this is the second one this session:** a page must not assume a
  migration has run just because the file is committed. The first was five columns written and never
  selected; this is the mirror of it. Nothing checks for either automatically — a checker that reads
  every `.select()` against the migrations that create those columns would catch both, and does not
  exist.

- **Apex sells more than one drawdown, and the payout parameters for each are UNREAD.** 18 August
  2026. Kag3 named legacy, intraday-trail and EOD-trail products and linked two help-center pages.
  **Both are behind a Cloudflare bot check** — the browser gets the challenge page and a direct
  fetch gets 403 — so neither was read, and nothing on this project may claim otherwise.

  What was built without them, because it does not depend on their numbers: `drawdown_type` is real
  now. It existed from the first migration, defaulted to `trailing`, and was never read or written,
  so the page modelled the intraday drawdown for everybody. An EOD account's closing balances are
  exactly the numbers the firm uses, which makes the figure exact rather than a floor — the page had
  been frightening people about a number it could compute precisely.

  Measured on a day that spikes to +$5,000 and closes at +$1,000: the same trades give **$1,700 of
  room intraday and $5,700 end-of-day**. Existing rows all keep `trailing`, the pessimistic reading.

  **Both pages were pasted the same day and are now in `prop-presets-by-product.sql`.** The two
  products differ in almost every term: legacy wants 8 trading days with 5 of them over $50 and a
  30% consistency rule, EOD wants 5 days over a size-specific minimum and a 50% rule; legacy's
  safety net applies to the first three payouts, EOD's for the life of the account; EOD closes after
  six payouts and legacy does not cap them.

  Two things they settled that were open. **The drawdown ladder is now independently confirmed** —
  Apex publishes the safety net as drawdown + $100, so all six trailing figures fall out of their
  own payout tables, arithmetic written for a different purpose. And **the lock is real on a funded
  legacy account**: the trailing drawdown in a PA stops at the starting balance plus $100. It is
  seeded as `funded_lock_at` and never fills an evaluation, which is the distinction the live
  account table proved.

  **The payout checklist is built** and reads every rule from the product's preset: trading days,
  qualifying days at the size's own minimum, the safety net, the consistency ratio and the payout
  count. Proved on two accounts trading identically where one had taken a payout — the window resets
  past the last approved payout, so the same trades fail consistency on one card and fail qualifying
  days on the other. That window is the thing most likely to be got wrong and it is the reason
  `account_adjustments` had to exist first.

  **Still open:** the maximum per request. Legacy caps it per size for five payouts then lifts it;
  EOD varies it by size *and* payout number across a 24-cell table. That needs a table of its own
  and the page must quote no maximum until it exists.

- **Payouts: `account_adjustments`, built and never seen against a real withdrawal.** 18 August
  2026. Nobody on this project has a funded account, so every part of this is proved on fixtures
  only.

  The arithmetic is proved. Three accounts trading identically — `+6,000` then `-1,000` — with a
  `$3,000` payout taken **between** the two trades on two of them:

  | | earned | holding | peak | worst dip | room |
  | --- | --- | --- | --- | --- | --- |
  | no payout | 5,000 | 5,000 | 6,000 | 1,000 | 5,500 |
  | payout, mark stays | 5,000 | 2,000 | 6,000 | 4,000 | 2,500 |
  | payout, mark falls | 5,000 | 2,000 | 3,000 | 1,000 | 5,500 |

  Same trades, same withdrawal: it costs the full $3,000 of room or nothing at all, depending on one
  boolean nobody can yet answer. **Earned is identical in all three**, which is the property that
  matters — the statistics page must never see a withdrawal.

  What is NOT proved: that a real firm behaves like either column, that the insert and delete work
  against live RLS, and that `payout_lowers_mark` is ever true. The funded card asks that question
  the same way it asks about the lock.

  **The migration is deliberately NOT applied**, at Kag3's call, and is filed under *Held back on
  purpose* in `supabase/RUN-THESE.md` rather than *Waiting*. Applying it now would put a table and a
  checkbox in front of somebody with no way to answer the question it turns on — which is how the
  drawdown lock went in. It costs nothing to wait: the payout controls only render on a `funded`
  account, so with none configured the page is identical either way, and the prompt to run it
  appears by itself on the first funded card. Do not clear it out of habit.

- **The drawdown lock does NOT fire on an Apex evaluation, and the site said it did.** 18 August
  2026. `prop-preset-drawdown.sql` seeded `lock_at` as drawdown + 100 across the ladder, on the
  published rule, and the advice given was to apply 6,600 to all nineteen accounts. It was applied.

  The firm's own account table contradicts it. Nineteen $250,000 evaluations between $6,746 and
  $8,242 in profit — all well past the $6,600 the lock is supposed to fire at — and every threshold
  still sitting exactly $6,500 under its high-water mark. Computed as a pure trailing floor,
  `6500 - (peak - current)` reproduces the firm's own distance-to-drawdown **to the cent on all five
  accounts checked**. Computed with the lock it overstates room by $1,891 on the first of them,
  which is the direction that ends an account.

  Preset corrected to null. The bulk form gained a **Clear the drawdown lock** checkbox, because it
  could set a field across nineteen accounts and not unset it, and the only way back was a
  hand-written `update` in the SQL editor — the one place on this project where a missing `where`
  reaches every member.

  **The lock may still be real on a funded account.** Nothing here tested that; there has never been
  a funded account on this project. What is established is that an evaluation trails the whole way.

- **DEFERRED UNTIL AN EVALUATION PASSES: does a funded account's drawdown stop trailing?** Kag3
  cannot answer it until he has one, and asked for it to be tracked. It is tracked in the place it
  can actually be answered rather than only here: a funded account with no lock recorded now prints
  the question on its own card, names the subtraction that settles it — *Max Balance less
  Liquidation Threshold* — and says what each outcome means. Recording any figure, zero included,
  removes it.

  **Until answered, the page assumes the floor trails for ever.** That is the conservative reading
  and it is the reason the default is not the published rule: a lock the account does not have
  invents room, and room that is not there is the one error on that page that ends an account.

  When it is answered, `prop_presets.lock_at` is where it belongs — but only for the sizes actually
  seen, and the seed comment in `supabase/prop-preset-drawdown.sql` should record which, the same
  way the $250,000 drawdown does.

- **Five columns on `prop_accounts` were written by the form and never selected back.** Found 18
  August 2026 by trying to answer "where is the lock_at field". `save()` had always sent `lock_at`,
  the three `payout_*` fields and `from_account`; the query asked for none of them. So a member
  filled in their payout terms, saved successfully, reloaded, and found the form empty — and every
  figure computed from those fields was computed from `undefined`, which is why no account could
  ever show its drawdown as locked. Fixed; the round trip is now proved on a probe.

  `lock_at` also only ever rendered inside the funded-account block, so an **evaluation** — the
  account that is actually one bad trade from over — had nowhere to record where its floor stops
  trailing. It is now beside the drawdown on every watched account and in the bulk form.

  Measured on identical trades: with the lock set, room left reads **$8,300** and the floor is
  locked $100 above the start; without it, **$6,320** trailing $6,500 under a peak of $8,580.

- **Step-down and finding-folding on `stats.html`.** 18 August 2026. Kag3 confirmed the earlier
  gate work renders correctly against his live journal; these two went in after that and have NOT
  been seen against live data. Driven through the probe on two fixtures.

  On the confounded fixture, findings went from four to two: *"your edge is concentrated in 12:00"*
  disappeared under step-down, and *"the day gets worse the longer it runs"* folded into
  *"11:00 is costing you"* at 100% containment. On a second fixture built with the same two effects
  made genuinely independent, nothing folds and all four findings stand — which is the check that
  matters, because a fold that swallows real findings is worse than no fold.

  One known hole remains, written up in `designs/journal-analytics.md`: containment catches
  *A is inside B* and cannot catch *A is what is left when B is removed*.

- **The calendar's month path and the journal's in-view summary.** 18 August 2026, driven through
  the same probe as the statistics page: the shipped files with only their `./app.js` import
  repointed at a session stub. On a fixture of 31 decisions held in 19 accounts, over a month built
  to rise then fall, the calendar reported *best it reached $16,649.32 on Aug 4, deepest dip
  $58,580.42 by Aug 23* against a month that ended at **-$23,247.07** — which is the whole reason
  the block exists. The day cells read "2 decisions" where they used to read the row count, and the
  journal's first line reads *31 decisions logged, held across 589 rows*.

  Not verified against a live journal, and the fixture is synthetic. The streak comparison reuses
  `streakOdds`, which was already proved; the walk itself is new and has no test beyond the probe.

- **The statistics page now gates every finding, and it was driven end to end against the real page
  source rather than a retyping of it.** 18 August 2026. `stats.html` is behind `requireRole`, so it
  was run through a probe: the shipped page with only its `./app.js` import repointed at a shim that
  stubs the session and the query. Everything else was the file as committed.

  On a fixture of 350 decisions held in 19 accounts, with a bad hour and a real disposition effect
  planted in it, the page before and after: **"the trade straight after a loss… 3,580 of them"**
  became no finding at all; **"1,330 trades in that hour"** became **"70 decisions in that hour
  across 70 days"**; and a denominator appeared — *6 habits were tested against chance and 4 cleared
  it, over 350 decisions rather than 6,650 rows*. Full re-render went from 317ms to 162ms, because
  findings are now cached per unit / range / account.

  **What is still not verified:** none of this has run against a live Supabase journal. The probe
  proves the code paths, the arithmetic and the rendering; it cannot prove the query returns what
  the page expects, and the fixture is synthetic.

  Two known holes, both written up in `designs/journal-analytics.md`: a strong group drags the null
  toward itself and can make a second group look significant by contrast (Westfall–Young step-down
  is the fix), and confounding is entirely unhandled — on the fixture 11:00 was always the fourth
  trade of the day, so two findings report one fact.

- **`permutationExtremes()` in `analytics.js` is proved.** 18 August 2026.
  Thirteen assertions in a browser against the shipped module: no value crosses a day boundary
  under the shuffle, group eligibility is identical in the real data and the null, p is never zero,
  the day-count rule refuses 20 trades taken over 2 days, and two seeded runs agree exactly.

  The two numbers that matter. On **200 synthetic journals with no relationship at all** between
  the hour and the result, one test per group reported a significant worst hour **28% of the time**;
  the max-T gate reported one **3%** of the time. Against a planted bad hour it fired **40 of 40**,
  so the correction did not cost the power to see a real effect.

  `permutationStatistic()` alongside it was calibrated the same way: on 150 journals with no
  relationship in them it fires 6.7% of the time for tilt, 4.7% for overtrading and 5.3% for
  disposition, and catches planted effects 29 of 30 and 30 of 30.

- **The Import button beside the file picker on `import.html`, and Cancel with it.** 18 August
  2026. The page could not be driven here - it is behind `requireRole` and there is no session on
  this machine - so what is proved is that the file parses, that nothing looks up an element the
  page never renders, and that the checker which says so catches the exact bug on the pre-fix file.
  Pressing either button against a real file has not been done.

  Worth knowing what was actually wrong: the wiring for `do-import-top` and `cancel-top` was
  already there and the buttons were not, so `$('do-import-top')` was null, the loop threw, and the
  line that wires **Cancel** never ran. Cancel has therefore never worked on that page.
  `tools/check-element-ids.py` exists now to catch that shape.

- **&ldquo;Room left&rdquo; on `props.html` — the arithmetic is proved, the rendering is not.**
  Added 18 August 2026. Fifteen assertions ran in a browser against the exact loop `progress()`
  uses, and it reproduces the figures Kag3's firm shows for a $250k Apex account from closed trades
  alone: `$6,380.00` of room and a `$247,722.70` threshold, with nothing pasted in. What has *not*
  been seen is the card drawing it against live rows, or a locked account — `lock_at` is a
  funded-account field and no funded account has ever been configured, so the `locked` branch has
  only ever run against fixtures.

  Two things to know before believing a number it prints. **It is a ceiling, not a floor**, which
  is backwards from every other figure on that page: the peak it measures from is the lowest the
  real peak can be, so a higher real peak means less room than shown. And it is only as right as
  the `drawdown` field — the account in the screenshot was configured at `6,000` where the
  balances imply Apex's `6,500`, which understates the room by $500. Wrong in the safe direction,
  still wrong.

- **The per-account bars on `calendar.html` now take a profit target as their ceiling.** Same date.
  The `prop_accounts` read that feeds it has not been watched against a project where the table is
  absent, which is the case it is written to survive silently.

- **Every bar on the site is drawn by `barTrack()` in `app.js`, and negatives grow from the right.**
  18 August 2026, and measured rather than assumed: seventeen assertions against the real
  stylesheet confirm which wall each fill touches, its width to a tenth of a percent, that a
  positive and a negative differ in position as well as colour, that a magnitude marked `is-bad` by
  hand stays left, and that over-ceiling clamps instead of overflowing. `design.html` carries all
  three shapes.

  The four hand-built copies this replaced disagreed about the only case that matters. `stats.html`
  scaled by `Math.abs` and drew a losing group at full length in red; `props.html` clamped at zero
  and drew a losing evaluation as nothing at all, so $200 down, $5,900 down and break-even were one
  picture. The calendar had the honest version until the profit-target ceiling landed earlier the
  same day and quietly replaced it with the clamping one.

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

- **`supabase/funded-accounts.sql` — run on 17 August 2026. Columns confirmed, constraint not.**
  All five new columns named in one select answer `200 []`, and `payout_nonsense` answers
  `400 42703`, so they exist rather than being ignored.

  **The `kind` constraint could not be confirmed from outside, and no probe will do it.** Inserting
  `kind='funded'` and inserting `kind='not_a_kind'` both answer `42501`: row-level security refuses
  the write before the CHECK is evaluated, so a valid and an invalid value are indistinguishable to
  an anonymous caller. Anyone tempted to re-check this later should know that before spending time
  on it — the proof is choosing **Funded** on a card and having it save.

  What the file adds: `funded` in the `kind` constraint, four payout columns and
  `from_account`. Nothing in it is destructive and nothing is reclassified: every existing row
  keeps `kind = 'prop'` and gets nulls.

  The maths is verified — 17 checks over `payoutProgress`, and the ones that matter are about
  **unset**. A card must never read as ready because a form was left blank: a threshold of `''` is
  NaN rather than zero, and *ready* requires both rules to be set **and** both met. The
  distinction between "no daily minimum set" (every day traded counts) and "a minimum of zero" (a
  losing day fails it) is pinned, because those are different rules and firms use both.

  **Not verified against a database.** The whole flow — press *Start the funded account*, get a new
  card, watch the evaluation retire — has never run. Two things to watch: the upsert uses
  `onConflict: 'user_id,account'`, which is the unique constraint `prop_accounts` already has, and
  the funded account is written **before** the evaluation is retired, so a half-failure leaves a
  stale evaluation rather than a lost account.

  **The payout figures are deliberately not seeded.** No Apex numbers are hardcoded anywhere, and
  none should be added without a source and a date beside them.

- **`supabase/profile-avatars.sql` — run on 17 August 2026. Column confirmed, policies not.**
  `?select=avatar_path` answers `200 []`, `?select=avatar_nope` answers `400 42703`, and
  `?select=last_seen_at,avatar_path` still answers `200 []` — the column is real and the earlier
  one survived.

  **The three storage policies are confirmed too, by the only test that could do it.** On
  17 August a member chose a picture on `account.html` and it uploaded, saved and rendered. No
  probe from outside could have shown this — an anonymous upload is refused whether or not a member
  write policy exists, so the refusal carries no information either way. Reads already worked
  through `storage.sql`; only the writes were in question, and they work.

  Still unshown: that a member is **refused** writing into `avatars/<somebody else's id>/`. The
  successful path says the policy grants; it does not say the policy is narrow. That needs a
  deliberate attempt with another uuid in the path, from a member's own client.

  **The trap avoided, which is worth knowing before anyone "tidies" this.** `avatar_path` is
  deliberately NOT added to `getProfile` in `app.js`. That function gates every page: it selects a
  fixed column list and returns null on any error, and `requireRole` sends a null straight to the
  sign-in page. Naming a column there that does not exist yet would not break the account page — it
  would sign everybody out of the entire site until the migration ran. `account.html` fetches the
  column on its own, and `admin.html` retries without it, the same way it already does for
  `last_seen_at`.

  Verified: 24 checks over initials and hue — an email's domain never contributes a letter, empty
  and null give `?` rather than throwing, all eight hues appear across 400 ids with a 45–57 spread,
  and the hue keys off the **id** so renaming yourself does not change your colour. In a browser:
  worst ink contrast 5.9:1 light and 6.6:1 dark across all eight, and a byline with a face is the
  same height as one without — it was 30px against 24 on the first attempt, which would have made
  messages in a thread step up and down depending on who wrote them.

  **Never run against storage.** Two things to watch: that a member uploading with somebody else's
  uuid in the path is refused (which the SQL editor cannot show, since RLS does not apply to the
  owner), and that replacing a picture leaves no orphan — the old object is deleted after the new
  path is saved, and that delete is deliberately ignored if it fails.

  **Moderation is not built.** The remedy is an admin clearing `avatar_path` (hides it everywhere)
  and deleting the object (removes the bytes) — two separate actions on purpose. Neither has a
  button yet; both are one line in the SQL editor.

- **Pictures in a notice — built 17 August 2026, never used against storage.** No migration: an
  admin already holds insert across the bucket through `storage.sql`, and members already hold
  SELECT on anything outside `journal/`, so `notices/` needed nothing new.

  The rule worth remembering is that **the render site decides whether images appear, not the
  author.** `renderBody(body, images)` draws an `<img>` only when handed a signed URL for that exact
  path. `members.html` signs first and shows pictures; the reply threads pass nothing and cannot,
  whatever a member writes. That is what keeps a tracking pixel out of the mentor's browser, and it
  needs no rule about who may write what.

  Verified: 18 checks in a browser, including four external address shapes that render as words
  with and without a map. **One real bug it caught before shipping:** `mdToHtml` did not emit
  `data-path`, so opening a notice for editing and pressing Save deleted every picture in it — the
  request succeeded and the images were simply gone.

  A picture can be **pasted or dragged in** as well as chosen from the button, and all three go
  through one `uploadImage(file)` handler the page supplies. The editor owns the picking; the page
  owns the storage. That split replaced a promise that had to guess when a cancelled file dialog had
  been cancelled — browsers fire no event for it — where the guess was a timer, the timer raced the
  upload, and the upload lost: every picture was stored and then discarded.

  **Never run against storage.** Watch that the upload lands in `notices/`, that the picture
  survives a save-and-reopen, and that a notice saved a day ago still renders — the stored value is
  a path and every view mints its own link, so a signed URL leaking into the saved text would show
  as a picture today and a broken one tomorrow.

- **The WealthCharts fold was wrong, and is fixed and confirmed against the source.** 17 August
  2026. `foldFills` bucketed fills on account plus `created_on` and took the FIRST open and FIRST
  close in each bucket. 36 buckets held two complete round turns — two trades filled in the same
  second — so each emitted one trade pairing an open with the wrong close and **discarded the other
  pair in silence**. Not counted as dropped either, because the existing guard only fires when one
  side is missing entirely.

  **The discarded closes were worth −8,507.34.** Losing trades that never arrive do not look like
  missing data; they look like a better month, which is why nothing complained for a week.

  Every open in a bucket is now paired, each with whichever close shares the longest order id
  prefix — WealthCharts derives a closing order id from its opening one, so inside a bucket that is
  unambiguous. It resolved all 72 pairs in the 36 crowded buckets. Used only within a bucket: across
  the whole export, unrelated ids can share as little as three characters.

  **Confirmed end to end, twice.** After re-importing one complete export, all 19 accounts match
  WealthCharts' Realized PnL to the cent and total 61,302.50, against 69,809.84 before. Then again
  on 18 August against a 2,284-row export containing 19 four-leg buckets — the shape that was
  losing trades — where the fold reproduces **both** of WealthCharts' own columns exactly: Daily
  PnL per account summing to 15,514.30, and Realized PnL summing to 76,816.80. 19 of 19 on each,
  no legs dropped. No cleanup
  was needed in the end: re-importing produced the correct ids directly, and the old rows turned out
  to be a subset of the correct ones rather than wrong ones — for 1672, 48 of 50, missing exactly
  the −472.63 of losses.

  **The habit that follows: export the whole range in ONE file.** These exports are cumulative
  snapshots. Importing a run of them re-folds the same buckets every time, and where a bucket's
  pairing changes between exports the new row arrives under a new `external_id` while the old one
  stays. A single file cannot do that, and the importer now says so at the top of `foldFills`.

  **Six accounts turned up that are probably not Kag3's at all**, and the reason matters more than
  the accounts do. **The Supabase SQL editor connects as the table owner, and RLS does not apply to
  the owner** — so `select ... from public.trades` there returns EVERY MEMBER'S journal, and nothing
  in the result says so. `APEX-247230-10` to `-13` and `APEX-28074-08`/`-09` are almost certainly
  other members who imported their own Apex exports.

  **Settled on 17 August, scoped properly:** joined to `profiles` and filtered to
  `kingkag3@proton.me`, the journal holds **914 trades totalling 61,302.50** — which is 18 accounts
  of 50 plus 1690's 14, exactly the round turns the corrected fold produces. The six unrecognised
  accounts are therefore somebody else's: were they his, the count would be 1,036. Nothing to
  investigate and nothing to remove.

  Two things follow. Any total taken from that editor without a `user_id` filter is a total across
  the membership, not one person's — the earlier 61,302.50 happened to be right only because no
  other member uses those nineteen account names, which is the wrong reason for a figure to be
  correct. And a `delete ... where account in
  (...)` written there reaches across every member in the table, with `trade_reviews` cascading
  behind it. Join `profiles` and name the owner on every query — the shape is written out in
  `supabase/RUN-THESE.md`. It used to live in `supabase/stray-accounts.sql`, which was deleted the
  same day once the question it answered had been answered.

  The site itself was never at risk: every page goes through PostgREST with a member's own key, and
  RLS holds there. This is a hazard of the SQL editor specifically, and it is worth remembering the
  next time a query in one of these files does not mention `user_id`.

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
