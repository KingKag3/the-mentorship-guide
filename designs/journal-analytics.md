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

**Not yet wired into the page.** The library is proved; `findings()` still ranks on money alone.

### Still to do on this

- Gate every family in `findings()`, then rank the survivors by impact.
- Say what did not fire. "Six patterns tested, two cleared the bar" — five of six with no
  denominator implies the sixth was checked and dull.
- Three cheap kills that catch more than more statistics would: drop the largest trade and see if
  the finding survives; report the worst single day's share of the group total; check the sign holds
  in both halves of the sample.
- A two-group variant for hold time. The disposition test compares medians rather than an extreme
  across groups, so it needs a difference statistic — shuffle the durations, not the outcomes.

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
