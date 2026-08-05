# Decisions

Why things are the way they are. Append-only: add to the bottom, never rewrite history. If a
decision turns out wrong, add a new entry that supersedes it and say so — a log that quietly edits
itself teaches nobody anything.

Each entry: what was decided, what it was decided *instead of*, and why. The alternative matters as
much as the choice, because without it the next session cannot tell whether the option was
considered and rejected or simply never occurred to anyone.

---

## 2026-08-04 — Indicators moved to a private repo

**Decided:** TradingView scripts live in `the-mentorship-pine`, private. Moved rather than copied.

**Instead of:** keeping them in `pine/` here.

**Why:** they carry entry, stop and target logic, and this repo publishes itself to the web. A copy
in both would defeat the point entirely. Nothing had been committed at the time, so there is no
history to scrub.

---

## 2026-08-05 — Thresholds are fractions of ADR, not fixed points

**Decided:** every threshold from the source books is normalised to a fraction of ADR, with the
original ES figure recorded alongside so the conversion can be audited.

**Instead of:** the raw point values as written, or a fixed multiplier per instrument.

**Why:** the books quote ES points from when ES traded near 4,000 and ran ~45 points a day. An early
build used a ×4 multiplier for NQ and called a 172-point CBDR "too wide" — but against a 900-point
ADR that is 0.19 of the daily range, which is *tight*. Only the ratio survives the move between
instruments and across years.

---

## 2026-08-05 — The sizer, clock and SMT checker are ungated

**Decided:** no login on `sizer.html`, `clock.html`, `smt.html`.

**Instead of:** gating them with `requireRole(['member','admin'])` like the rest of the members area.

**Why:** they hold no private data and live in a public repo, so a gate would be decorative in
exactly the way `README.md` already argues for the concept pages. They also work as a funnel.

**Reversible in four lines each** — add an `#auth-root` div and a `requireRole` call. If the
mentorship should be gating them, that is a product decision, not a technical one.

---

## 2026-08-05 — Points and R are derived, never typed

**Decided:** the journal computes points and R from entry, stop and exit. There is no input for
either.

**Instead of:** letting the member enter their own R, which is what most journals do.

**Why:** a journal where the recorded R can disagree with the recorded prices produces statistics
that mean nothing — and the statistics are the entire reason the journal exists.

---

## 2026-08-05 — Only closed trades count in the statistics

**Decided:** `stats.html` filters to trades with a computed R. Open trades still appear in the
journal, tagged `open`.

**Instead of:** counting open trades as zero, or as their unrealised value.

**Why:** an open position has no result. Counting it as zero drags every average toward nothing;
counting it at market makes the page change meaning between refreshes.

---

## 2026-08-05 — Thin slices are marked, not hidden

**Decided:** any statistics slice under ten trades gets an `n=` tag and stays visible.

**Instead of:** suppressing it until the sample is large enough.

**Why:** a member who sees a category vanish assumes a bug. A member who sees `n=3` learns something
about sample size, which is most of what the statistics page is trying to teach anyway.

---

## 2026-08-05 — A bar touching both stop and target is recorded as a stop

**Decided:** in the Pine indicator's forward-test tally, ambiguous bars resolve pessimistically.

**Instead of:** resolving to the target, or excluding the trade.

**Why:** OHLC cannot recover the order of events within a bar. The optimistic reading inflates every
result, and a forward test that flatters itself is worse than no forward test.

*(Lives in the pine repo but recorded here too, because it is the kind of decision that gets
"fixed" by someone who does not know it was deliberate.)*

---

## 2026-08-05 — Session knowledge goes in the repo, not in memory

**Decided:** durable context lives in `CLAUDE.md` (read automatically at the start of every
session), `DECISIONS.md` and `HANDOVER.md`. Memory files hold only what is genuinely local to one
machine.

**Instead of:** the memory system, which was the obvious answer, or exported transcripts.

**Why:** memory files and session transcripts both live under `~/.claude/` and are never touched by
git. Kag3 works from two PCs. Anything written only to memory is invisible on the other machine —
which is precisely the failure the question was trying to avoid.

Transcripts are still worth exporting occasionally — `tools/export-session.py` in the pine repo
turns one into readable markdown — but that is archiving, not teaching. A future session will not
read a transcript unless told to. It always reads `CLAUDE.md`.

---

## 2026-08-05 — Scheduled overnight runs need pre-approval

**Observed, not decided.** A one-time task was scheduled for 02:08 to continue the members-area
build. Its session file exists, so it started. It committed nothing, and the repo was untouched.

**Most likely cause:** it stalled waiting on a tool permission prompt with nobody awake to answer.
Approvals granted during a run are stored on the task and reused, which implies the *first* run is
the one that blocks.

**How to apply:** before relying on an overnight run, trigger it once manually with "Run now" while
awake, so the approvals are banked. Until then, treat scheduled builds as best-effort and do the
work in-session — which is what happened here, and why the five tools exist at all.

---

## 2026-08-05 — The checklist records honesty rather than enforcing completion

**Decided:** the pre-trade checklist is five named items rolling up into
`trades.checklist_done`. An incomplete checklist raises a confirmation naming what was skipped, and
then saves anyway.

**Instead of:** ROADMAP 2.2 as written — "all ticked before the journal will accept an entry".

**Why:** a hard gate makes every stored trade checklist-complete, which destroys the only
comparison the checklist exists to support. `stats.html` already slices by `checklist_done` in
order to test whether the discipline pays; if the journal refuses incomplete entries, there is
nothing to compare against and the slice always reads 100%. Worse, a gate teaches members to tick
boxes to get past it, so the column stops describing reality and the statistic silently becomes a
lie.

The friction ROADMAP 2.2 wants is real and worth keeping — it is applied at save time as a
confirmation the member has to read, listing the steps they skipped.

**Reversible:** the gate is four lines in the submit handler. If the mentorship would rather refuse
incomplete entries, that is a product decision, and this entry is the argument against it rather
than a technical obstacle.

**Known limit:** only the rolled-up boolean is stored, so editing an old trade restores all five
boxes or none. Recovering which individual step was skipped needs five more columns and another
migration; the comparison does not need it.

---

## 2026-08-05 — Empty states must say which kind of empty they are

**Decided:** `stats.html` distinguishes "no trades logged" from "trades logged, none closed", and
names the count in the second case.

**Instead of:** one message covering both, which is what shipped.

**Why:** a member logged a trade, opened the statistics page, and was told there was nothing to
measure. Everything was working — the trade had no exit, so it had no R, and trades without an R
are deliberately excluded. But the page said the same thing it would have said if the insert had
failed, and a real session was spent hunting a bug in a working insert path.

The reasoning was already recorded in this file and in a code comment. Neither is visible to
somebody looking at the page. **An invariant that only exists in the documentation will be
rediscovered as a bug.**

Generalises: any empty state covering two causes with one message will eventually send someone
looking for a fault that is not there.

---

## 2026-08-05 — Site URL must carry the repository path

**Observed, then fixed in the documentation.** Confirmation emails were landing on
`https://kingkag3.github.io/#access_token=…` — the root of the github.io domain, which belongs to a
user-site repo that does not exist. GitHub serves its own 404 there and nothing in this repository
can intercept it. A real signup was blocked by this.

**Site URL is now specified as** `https://kingkag3.github.io/the-mentorship-guide/login.html`, with
a wildcard redirect entry over the project path. Pointing at `login.html` rather than the site root
is deliberate: that page already forwards an authenticated visitor, so a member who has just
confirmed lands somewhere that acts.

`SETUP.md` step 4 now states the failure mode explicitly, because the setting looks plausible when
it is wrong and the resulting email looks correct until it is clicked.

---

## 2026-08-05 — SETUP.md and HANDOVER.md disagreed about a complete install

**Observed.** The migration list in `SETUP.md` stopped at `phases.sql`. `HANDOVER.md` said the
first thing to do was run `trades.sql`. Following the setup guide end to end therefore produced a
site whose journal and statistics pages were deployed, reachable, and backed by no table.

**Fixed** by completing the list and stating that all eight files are required.

**Worth generalising:** when two documents describe the same procedure, whichever one the reader
happens to open decides the outcome. The install steps belong in exactly one place.

---

---

## 2026-08-05 - The site is Trade Karma; the subject is still Smart Money

**Decided:** the brand string becomes Trade Karma everywhere - masthead, titles, footers, docs. The
eighteen places `Smart Money` names the *subject* are left alone.

**Instead of:** a search and replace on "Smart Money".

**Why:** that would have looked like it worked and quietly broken the vocabulary the site teaches.
"Smart Money Concepts or SMC refer to the same body of material" becomes a sentence about a brand,
which is a different claim and a false one. The glossary, the concept pages and the credit line all
depend on that term meaning something. Counted before and after: 18 either side.

The same reasoning stopped the rename touching `knowledge/sources.md` in the pine repo, where two
cited book titles contain the old term. Renaming a citation falsifies it.

---

## 2026-08-05 - The new-indicator badge lives in localStorage

**Decided:** the members index flags indicators changed since **this browser** last opened the
indicators page, stored in `localStorage`.

**Instead of:** a `last_seen_scripts` column on `profiles`.

**Why:** it is a per-device convenience, not a fact about the member, and it needs no migration - on
a project that had already shipped a page depending on an unrun SQL file, that mattered more than
the tidier model. The cost is that a second device shows the badge again, which is the right way
round: better told twice than never.

---

## 2026-08-05 - Tools are defined once

**Decided:** `TOOLS` in `app.js` is the only place a tool is named. The members index renders it
as cards, every tool page as a rail.

**Instead of:** a hand-written link row per page, which is what existed.

**Why:** three pages had already drifted into three different lists - statistics did not link to the
clock, the journal did not link to the indicators, none linked to the SMT checker - and a fourth was
about to be written. Adding a tool is now one entry rather than seven edits.

---

## 2026-08-05 - Anything awaited before first paint gets a deadline

**Decided:** auth calls on the path to first paint carry a twelve second timeout and write a
placeholder before their first `await`.

**Instead of:** awaiting them bare, which is what every page did.

**Why:** a members page rendered a heading, a footer and nothing between. The code was correct, the
deployed files were byte-identical to local, and every Supabase endpoint answered in under a second.
`supabase.auth.getUser()` simply had not settled, so nothing downstream had written anything, and
the result was indistinguishable from a broken build.

**Generalises past auth.** This is the second time a silent state has cost a session - the
statistics page showing "nothing to measure" when a trade existed was the same shape. An
unreachable state and a slow one look identical if neither writes to the page, so both a deadline
and a placeholder are required, not optional.