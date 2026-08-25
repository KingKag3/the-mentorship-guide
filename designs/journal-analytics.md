# Journal analytics — design

What a trading journal can honestly tell somebody about their own trading, in what order it is worth
building, and the two properties of the current data that constrain all of it.

Nothing here is a prediction. `CLAUDE.md` says record and analyse, never signal, and that line falls
in a specific place: **these panels may describe what happened and quantify what removing something
would have been worth. They may not recommend a trade.** "Your best setup is X, take more of them"
is a signal wearing a lab coat.

---

## The governing principle

**Every panel ends in a sentence somebody could act on tomorrow, or it does not ship.**

Win rate, profit factor and an equity curve are the standard furniture of every trading dashboard
ever built. They describe. They do not tell anyone what to do differently, and a member who reads
them learns that they are up or down — which they already knew.

The useful form is comparative and counterfactual:

> You lose money after 13:00. Those 35 trades cost $7,830. Without them, May is +$2,900 instead of
> −$1,425.

A ranking says which slice is worst. **A counterfactual says what acting on it is worth**, and that
is the difference between a chart and a decision.

---

## The constraint that shapes everything: what a broker export does not carry

An imported trade has a timestamp, a symbol, a direction, a size, prices and a result. That is all.

It has **no stop**, so no R. It has **no tags** — no model, no session, no PD array, no liquidity
taken, no checklist. Those exist only when a member hand-logs a trade.

This matters more than it sounds, because the statistics page as first built keyed seven of its
eight slices off exactly those tags, and measured everything in R. Importing three months of real
trades therefore produced a page that was empty in every way that mattered, and said so with a
message about missing exit prices that the trades all had.

**So: the analytics that pay for themselves are the ones that need no tagging.** Nobody hand-tags 171
imported trades. A panel that requires discipline the member has not shown yet will be blank for
exactly the people who most need it.

Everything in Tier 1 and Tier 2 below is derivable from a broker export alone.

---

## Tier 1 — where the money comes from

Slices that need only the trade itself:

| Slice | Why |
| --- | --- |
| Hour of day | The clock, not the session tag. Works on imported data |
| Day of week | Already built |
| Symbol, direction | Cheap, and occasionally damning |
| Hold time bucket | Under a minute, minutes, hours — behaviour in disguise |
| Position size | Does trading bigger go with trading worse |

**Then the counterfactual**, which is what makes the slice actionable rather than interesting:
remove the worst slice and re-run the curve. One line under each breakdown — *"without these, the
period is X instead of Y"*.

---

## Tier 2 — behaviour, which is where a journal beats a broker statement

None of this needs a tag, none of it exists in any broker's own reporting, and it is the part a
member cannot see by scrolling their fills.

- **Trade number within the day.** Does the fourth trade lose? Ranking outcome by sequence position
  turns "I overtrade" from a feeling into a number.
- **What happens after a loss.** Minutes to the next entry, whether size went up, whether it won.
  That is tilt, measured. A shorter gap and a bigger size after a loss is the single most
  recognisable destructive pattern in retail trading.
- **Hold time on winners against losers.** If the median winner is held four minutes and the median
  loser forty, that is the disposition effect — cutting winners, nursing losers — and it is
  expensive and invisible without this comparison.
- **Days that ran long.** Group days by how many trades they contained and total them.

---

## Tier 3 — whether any of it is distinguishable from luck

The page already has `MIN_SAMPLE = 10` and marks thin slices rather than hiding them, which is the
right instinct: hiding a slice makes a member wonder where it went.

Push it further, on the same reasoning as [day-character.md](day-character.md): report an interval
rather than a point estimate, and say plainly when a slice cannot be told apart from chance. A
60% win rate over 20 trades and a 60% win rate over 400 are different claims, and printing both as
"60%" is the tool lying by omission.

---

## The second constraint: copied prop accounts

A member running seventeen copied accounts produces seventeen rows per decision. Aggregate P&L is
then seventeen times a number that means nothing, and win rate is right by accident.

`ROADMAP.md` already decided the copies get imported rather than deduplicated, because collapsing
them hides the only thing worth knowing — the account that diverged. The consequence for analytics:
**default to one account**, and make the cross-account view explicitly about divergence rather than
about totals.

---

## Build order

1. **The unit fix.** ✅ Dollars or R, chosen by the member, defaulting to whichever the journal
   actually covers. Plus `risk_settings`, so a member can state what one R costs and unlock R for
   imported trades — a declaration, never an inference. See `supabase/risk-settings.sql` for why
   inferring it from their own average loss is circular.
2. **Hour of day, with the counterfactual.** ✅
3. **Tier 2 behaviour panels.** ✅ Sequence within the day, the trade after a loss, and hold time on
   winners against losers. The last needed `closed_at`, which the importer had been reading and
   throwing away — see `supabase/trade-closed-at.sql`.
4. **Intervals and the luck test.** ✅ Wilson on the win rate, a t-statistic on the average trade,
   and a bootstrap.
5. **Findings.** ✅ Not in the original plan, and the most valuable thing on the page. The tool does
   the analysis and writes sentences instead of handing over panels and hoping.

### Still open

6. **Per-account defaulting**, so seventeen copies do not inflate every aggregate. `J-02`.
7. **A warning on the counterfactual**, because removing your worst hour in hindsight flatters a
   random trader too. `J-03` — ✅ **answered with arithmetic on 18 August 2026.**
   `permutationExtremes()` returns `gain` beside `gainByChance`, which is the same subtraction done
   on shuffled outcomes. On 200 journals built with no relationship between hour and result, the
   worst hour appeared to be costing $201 and chance alone accounted for $178 of it.
8. **Streaks against chance.** A seven-loss run feels like a collapse and is unremarkable at a 40%
   win rate. The comparison is cheap and the reassurance is real.

---

## The permutation gate — added 18 August 2026

The findings engine tests six families, ranks by money and shows the top five, and nothing asked
whether a pattern that size turns up anyway. It does. Pick the worst of seven groups of coin flips
and it looks terrible, for everybody, every time.

`permutationExtremes()` in `analytics.js` is the gate. Two decisions carry it:

- **Outcomes are shuffled within their own day.** The labels never move — the null is "this label
  says nothing about the result". Confining it to the day keeps the fact that trades on one morning
  share a market and a mood; a null that treats them as independent is too tight and makes
  everything look significant.
- **Each shuffle keeps the extreme across every eligible group.** Testing groups one at a time and
  reporting the worst is the multiple-comparison error with extra steps. Comparing the observed
  extreme against the null's extreme pays for having looked at seven hours, because the null looked
  at seven too. This is a max-T permutation test.

Eligibility is **≥10 trades and ≥5 distinct days**. The day count is new: ten trades over two days
are not ten readings of a habit.

Measured on 200 synthetic journals with no real effect, at 200 runs each:

| | fires at p < 0.05 |
| --- | --- |
| One test per group, report the worst | 28.0% |
| Max-T across groups | 3.0% |

Slightly conservative rather than exactly 5%, which is the safe direction. Against a planted bad
hour it fired 40 times out of 40, so the correction has not cost the power to see a real one.

Feed it `decisions()`, never raw rows — eighteen copies are one decision, and the wrong unit is both
statistically wrong and fourteen times slower (170ms against 2.4s at 2,000 runs).

### Wired into `findings()` on 18 August 2026

All six questions now have to clear the gate before they may be printed:

| Question | How it is tested |
| --- | --- |
| Worst hour / best hour | `permutationExtremes`, max-T across hours |
| Worst weekday | `permutationExtremes`, max-T across weekdays |
| The fourth trade onward against the first three | `permutationStatistic`, fixed split |
| The trade after a loss | `permutationStatistic`, **relabelling** each shuffle |
| Losers held longer than winners | `permutationStatistic`, **durations** shuffled |

Money still decides the ORDER of what survives, because "which of these should I care about" is a
money question. It no longer decides what appears, because "is this real" never was.

**The shape of the edge is deliberately not gated.** It describes the whole sample without picking
anything out of it — your win rate is your win rate — so there is no selection to correct and a
permutation test would be theatre.

`permutationStatistic` exists for the three that ask one question rather than "which of these seven
is worst". Tilt is why it has to take a measure rather than a fixed split: which trades follow a
loss is decided by the outcomes, so the split is recomputed from each shuffled arrangement.
Disposition inverts it — the win/loss split cannot move, so the durations are shuffled underneath
it.

**Evidence and impact are different samples on purpose.** Every gate runs on `decisions()`; every
figure quoted runs on all rows. Money aggregates, behaviour deduplicates — this is the first place
the page actually does both.

### What changed on a copier's journal

Measured on a fixture of 350 decisions held in 19 accounts, 6,650 rows, with a bad hour and a real
disposition effect planted in it:

| | before | after |
| --- | --- | --- |
| "trades after a loss" | 3,580 | finding withdrawn |
| trades in the worst hour | 1,330 | 70 decisions across 70 days |
| findings shown | 5 | 4 |
| denominator shown | none | 6 tested, 4 cleared |
| full re-render | 317ms | 162ms |

The tilt finding was the whole point. It came from `sequence()` running over rows, which made every
losing decision its own predecessor eighteen times over — see `sequenceOfDecisions`.

Six gates at 500 runs cost about a second, which is fine once and awful on every filter flip, so
findings are cached per unit / range / account and cleared when a stated R changes.

### Step-down and folding — 18 August 2026

Both holes above are closed.

**Step-down.** Both tails of the clock gate can clear at once and the second is not independent of
the first: one catastrophic hour drags the whole null distribution toward itself, because shuffling
spreads those losses across every hour, and an ordinary good hour then looks extraordinary by
contrast. The stronger tail is now settled first, its decisions removed, and the other tail asked
again on what is left. On the fixture that removed *"your edge is concentrated in 12:00"*
entirely — it had cleared at 1 in 250 while being an unremarkable hour next to a disastrous one.
Cost is one extra gate, only on the journals where both ends clear.

**Folding.** Each finding now carries the set of decisions it is about, and any pair where the
smaller set sits ≥70% inside the larger is reported as one. On the fixture 11:00 was always the
fourth trade of the day, so *"11:00 is costing you"* absorbed *"the day gets worse the longer it
runs"* with the note **"the same trades also cleared as the fourth trade onward (100% of them);
that is one habit described twice, not two to fix"**.

Containment, not Jaccard, and deliberately. Jaccard scored that pair at 0.5 and let both through,
because it punishes the larger group for the trades the smaller one does not have — which is
exactly the information being tested for.

Nothing is deleted. The louder finding keeps the headline and names what it absorbed, because "these
are the same trades" is itself the useful part: one thing to change, not two.

Findings whose set is *everything* — how long you hold, the shape of your edge — are exempt. They
describe an axis rather than a subset, so containment against them is always total and folding on it
would swallow the page.

**Proved by negative control.** A second fixture with the same two effects made genuinely
independent — 11:00 landing at position 1, 2, 3 or 4 depending on what else was traded that day —
folds nothing and reports all four findings separately. The first version of that fixture was wrong
and it is worth writing down why: it shuffled the order the rows were *generated* in, and
`sequenceOfDecisions` sorts by timestamp, so 11:00 was still always the fourth trade. The fold was
right and the test was wrong.

### Caught on live data, 18 August 2026

Kag3's own journal produced the shape neither fixture had: **one finding shown, and none cleared.**

    You win often and lose big. A 71% win rate, but the average loser (-$504.01) is larger
    than the average winner ($364.32).

    7 habits were tested against chance and none cleared the bar.

Two faults in one screen.

**The denominator said seven and six exist.** When the leading tail of the clock gate failed, the
code fell through to a block that re-asked *both* tails on `second` — and with nothing settled,
`second` is the same object as `first`. The losing tail was counted twice, on identical data, for
an identical answer. The clock now asks exactly two questions whichever way round they go.

**A finding sat above the words "none cleared the bar".** The shape of the edge is deliberately
ungated: it describes the whole record rather than picking a slice, so there is nothing to correct
for. But the page never said so, and the intro above it claimed *everything here had to survive a
test*. Read together that is the page contradicting itself, which is the fastest way to lose
somebody who was starting to trust it.

`gated` is now a flag of its own rather than being inferred from whether a finding has a key set —
conflating them was the actual bug. Hold time has no key set and *is* gated; the shape of the edge
has no key set and is not. The note now says which, and the intro no longer overclaims.

**113 decisions from 1,379 rows, and nothing distinguishable from chance, is the gate working.**
That is the honest answer at that sample size and it is worth more than a pattern that would have
turned up anyway.

### Still to do on this

- **Complement confounding, which containment cannot see.** On the independent fixture, "your edge
  is concentrated in 08:00" cleared — because 08:00 is usually the first trade of the day and so
  never follows a loss, which makes it the tilt effect seen from the other side. Containment catches
  *A is inside B*; it does not catch *A is what is left when B is removed*.
- Three cheap kills: drop the largest trade and see if the finding survives; report the worst single
  day's share of the group total; check the sign holds in both halves of the sample.
- Report per-R or per-contract effects, so tilt cannot be a size effect wearing a hat.
- Block bootstrap by day in `bootstrap()`, which still resamples individual trades.

---

## Your last session &mdash; 19 August 2026

Asked for as morale: *how you did that day, micro progression type of stuff*. It is the request most
likely to turn this page into something it should not be, so the design rule is stated rather than
assumed.

**It deliberately does not count green days in a row.** That streak is the easiest number here to
draw and the worst one to show: at this sample size a run of winning days is mostly luck &mdash; the
luck panel puts a number on exactly how much &mdash; and a run somebody is watching is a run they
will hold a loser to protect. A number that changes behaviour that way is a signal, and this project
does not signal.

What accumulates instead is what a person controls: whether they turned up, the size of the session
against their own usual, and their own checklist. Those move with effort rather than luck, they read
the same on a red day, and **a red day worked properly reads as a day done right** &mdash; which is
both true and the only version of encouragement worth printing.

The result is still shown, because hiding it is its own kind of lie. It is shown against the
member's own recent days rather than against zero: *better than 4 of your last 20* is a fact,
*you made money* is a coin landing. The comparison window excludes the day itself, since a day
always beats itself.

The checklist card is hidden entirely on a journal that has never used it. An imported journal has
`checklist_done` false on every row, and printing a streak of zero would be the page telling
somebody off for using the importer.

### The lean radar

Added the same day, replacing the idea of a green-day streak with something that actually says
where the session went. Two polygons over the hours the member trades: this session, and how they
usually spread a day.

**A single shape on a radar says almost nothing.** Three decisions draw one spike and it looks
dramatic whatever it means — which is exactly what the reference chart that prompted this was
doing, showing one domain at 100% and the rest blank. The baseline is therefore the content rather
than decoration, and it is what makes the chart honest at n=3: *75% of the session against 22%
usually* is a real statement about a four-trade day, where *75% of your trades were at 11:00* is
not.

Counted in **decisions, not money**. Weighting by profit would make a lucky hour look like a habit,
which is the opposite of what it is for.

The verdict is written out underneath in a sentence, because a picture nobody can summarise is
decoration. Below two decisions it declines to read a shape at all and says so.

Hand-drawn SVG — no build step, no library for one polygon — with every colour a token, so it
survives the dark theme and a change of brand. Verified in both.

**Five axes, four of them habits.** The clock turned out to be the least interesting: it mostly says
what time zone somebody lives in. The others are behaviour, and all four are derived from what a
broker export already carries:

| Axis | Bands |
| --- | --- |
| How long | under a minute · 1–5 · 5–20 · 20–60 · over an hour |
| How big | smaller · usual · double · 3x or more, against that member's own median |
| How deep in | 1st · 2nd · 3rd · 4th · 5th or later |
| After what | first of the day · after a win · after a loss |

Size is relative to their own median because two contracts is enormous on one account and nothing on
another, and the question is whether *today* was bigger than usual *for them*.

Ordinal axes keep their own order and show every band including the unused ones — sorting "3x or
more" between "usual" and "smaller" because it happens to be more common would make the shape
unreadable, and a missing band would hide that it has never happened. Only the clock sorts by use,
because it has no natural order.

Proved on a session planted to be scalped at triple size: *under a minute, 100% against 4% usually*
and *3x or more, 100% against 4% usually*, while the two axes with nothing planted stayed quiet.

### Still to do on this

- Model and entry type would make good axes and are empty on an imported journal. The bucket is a
  function, so they are a one-line addition the day somebody is hand-logging — worth gating on the
  tag actually being used, the way the checklist card is.
- Nothing here notices a day that broke a rule the member set &mdash; over their own trade count,
  or trading after a stop-loss day. Those are process facts and would belong here rather than in
  the findings, because they are about today rather than about a pattern.

---

## Open questions

- `J-01` Is hold time reliable on imported data? Answered in part: `closed_at` now imports from the
  later fill, and the fixture shows a 3.6× disposition ratio cleanly. **Partial exits are still
  open** — they arrive as separate rows, so one position scaled out of in three lots reads as three
  trades with three hold times, and the median moves for a reason that is not behaviour.
- `J-02` What is the right default account when a member has seventeen? First alphabetically is
  arbitrary. Most trades? Most recent? Asked once and remembered?
- `J-03` Does the counterfactual need to warn about its own selection bias? Removing your worst hour
  in hindsight always improves the curve, including for a random trader. It probably needs the same
  honesty treatment as everything else — the number is real, the implied promise is not.


---

## What the numbers looked like on the fixture

Recorded because it is the only end-to-end evidence any of this works, and because the shape of it
is the argument for building the page this way at all.

Three months, 163 trades, deliberately seeded with a good 10:00 hour, a bad afternoon, a slump, an
overtrading penalty, tilt after losses and a disposition effect:

| | |
| --- | --- |
| Result | −$8,605 |
| Win rate | 39.3% — Wilson interval 32.1% to 46.9% |
| Average trade, in standard errors from zero | −1.16 |
| Bootstrap redeals finishing down | 90% |
| Median hold, winner against loser | 432s against 1,571s — 3.6× |
| The trade after a loss | 62 of them, −$188 average, back in after 25 minutes, size 2.0 |
| The trade after a win | 41 of them, −$4 average, back in after 71 minutes, size 1.0 |

**Seen working on 11 August 2026.** Every finding on the page matched the value it was seeded with —
the 3.6x hold ratio, 62 trades after a loss averaging -$187.82 against -$3.66 after a win, 10:00
carrying +$4,485, the fourth trade onwards at -$202.14. Importer, `closed_at`, `analytics.js`, the
findings engine and the lesson links all agreeing, which is the only evidence that matters and the
reason the fixture was seeded with known answers in the first place.

**The t-statistic is the interesting one.** A member down eight and a half thousand dollars will
conclude something about themselves. At −1.16 the honest reading is that this quarter cannot
distinguish their trading from chance in either direction — the losing is not proven either. That is
a harder thing to say than "you are losing", and it is the thing a mentor would say.
