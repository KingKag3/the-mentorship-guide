# Handover

State of the members-area build. Written for whoever picks this up next, including a fresh session
with no memory of how any of it got here.

Last updated: 6 August 2026, fifth session.

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
>
> What that check *cannot* see: whether the partial unique index on `(user_id, external_id)` was
> created, because indexes are not visible to the anon key. The importer's de-duplication depends on
> it. Importing the same file twice is the test — the second run should leave the trade count
> unchanged.

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
- **`admins read shared`** — needs a second account with `shared_with_mentor` set.
- **The pre-trade checklist end to end.** The roll-up logic was run in a browser across all five
  states; the module load, the save-time confirmation and the value reaching the database were not.
- **Mobile layout.** `.tool-grid` and `.field-pair` have media queries but have not been looked at
  on a narrow viewport.
- **The new-indicator badge count.** The rendering is exercised; the count against real rows needs a
  signed-in session. Publish something and check the members index reads `new`.
- **`trade-karma-pd-arrays.pine` since the model marker.** It compiled before the 2022-model block,
  the session shading and the label rework went in. `trade-karma-htf.pine` has never compiled at
  all.

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

**First thing to do:** import the same Tradovate file twice. The first run proves the mapping; the
second proves the de-duplication, which is the only part of the importer that cannot be checked
without a live database. If the count doubles, the unique index in `trade-import.sql` did not get
created.

**Then:** log one closed trade by hand and confirm it reaches the calendar and the statistics. That
round trip is still unproven.

**Then:** compile the current `trade-karma-pd-arrays.pine`. `trade-karma-htf.pine` is now confirmed
clean, so this is the last unverified script. Paste over the whole editor buffer — pasting *into* it leaves the old
declaration and produces "your script has 2".

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
