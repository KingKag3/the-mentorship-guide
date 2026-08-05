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
