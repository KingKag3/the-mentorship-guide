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

1. **The unit fix.** Dollars or R, chosen by the member, defaulting to whichever the journal actually
   covers. Until this is done every other panel is decoration on top of an empty page. *Done — see
   `stats.html`.*
2. **Hour of day, with the counterfactual.** The single most valuable panel, and it works on
   imported data with no effort from the member.
3. **Tier 2 behaviour panels**, in the order listed. Sequence-within-day first; it is the cheapest
   and the fixture shows it clearly.
4. **Intervals and the luck test**, once there is something to qualify.

---

## Open questions

- `J-01` Is hold time reliable on imported data? The fixture has it; a real Tradovate export gives
  bought and sold timestamps, so yes — but partial exits arrive as separate rows and may distort it.
- `J-02` What is the right default account when a member has seventeen? First alphabetically is
  arbitrary. Most trades? Most recent? Asked once and remembered?
- `J-03` Does the counterfactual need to warn about its own selection bias? Removing your worst hour
  in hindsight always improves the curve, including for a random trader. It probably needs the same
  honesty treatment as everything else — the number is real, the implied promise is not.
