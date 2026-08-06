# Roadmap

What the members area could become, in the order worth building it.

The site is deliberately plain: static HTML, no build step, Supabase for auth and storage,
row-level security doing the real enforcement. Nothing below changes that. Every item is a new
page plus, at most, one new SQL file alongside the others in `supabase/`.

Two rules hold across everything here:

- **No live market data.** Real-time CME data is licensed, metered and mostly not redistributable.
  Free feeds are unreliable and usually forbid exactly this use. Every tool below either needs no
  price data at all, or takes numbers the member pastes in from their own platform. Members already
  have a chart open; the site does not need to be one.
- **Record and analyse, never signal.** A calculator that sizes a position the member has already
  chosen is a utility. Something that says "long NQ here" is a different product with a different
  liability.

---

## Phase 1 — the core loop

These three are one product. Build them together; each is much less useful alone.

### 1.1 Position sizer — **built** (`sizer.html`)

Account size, risk percentage, entry and stop in. Contracts out, with the mini-versus-micro answer
made explicit.

| Contract | Point value | Tick | Tick value |
| --- | --- | --- | --- |
| ES | $50 | 0.25 | $12.50 |
| MES | $5 | 0.25 | $1.25 |
| NQ | $20 | 0.25 | $5.00 |
| MNQ | $2 | 0.25 | $0.50 |

Verify these against the CME contract specifications rather than trusting the table — they are here
as a sketch of the shape, not as a source of truth.

A twenty-point NQ stop is $400 on one NQ and $40 on one MNQ. The tool's real job is saying "your
risk does not fit a single micro; this trade is too large for this account" out loud, because that
sentence is the one nobody says to themselves.

No database. One page, one form, pure arithmetic.

### 1.2 Trade journal — **built** (`journal.html`, `supabase/trades.sql`)

Not a generic journal. Every entry tags itself against the curriculum's own vocabulary, so the
journal and the lessons describe the same world:

- **Model** — 2022 entry, Silver Bullet, turtle soup, ATM, London protraction
- **Session** — which killzone, and whether the entry was inside it or chased outside it
- **PD array** — what was entered from: FVG, order block, breaker, mitigation block
- **Liquidity** — what was taken first: Asian high/low, PDH/PDL, PM session extreme, an equal high
- **Bias** — the daily bias held beforehand, and whether the trade agreed with it
- **Result** — points, R multiple, and how it was managed

Screenshots go into the existing private `lesson-media` bucket. A new `trades` table with
`user_id uuid references auth.users` and a policy of `user_id = auth.uid()`, so members only ever
see their own rows — plus an optional `shared_with_mentor` flag that widens the select policy to
admins for that row alone.

### 1.3 Statistics — **built** (`stats.html`)

The payoff for all that tagging, and the reason someone renews rather than reading the free pages
once and leaving.

Win rate and expectancy sliced by model, by killzone, by day of week, by whether the trade agreed
with the stated bias. This is what converts the mentorship from lecture into feedback: a member
discovers their Silver Bullet expectancy is negative and their London turtle soups carry the
account, and that discovery is worth more than any lesson.

Each entry in `models.html` then links to "your results with this model."

---

## Phase 2 — daily-use utilities

### 2.1 Killzone clock — **built** (`clock.html`)

Current killzone, countdown to the next, the 17:00 close and the Sunday reopen. Small, used every
day, and easy to get wrong in exactly one way: everything in the model is New York local, so it must
be computed in `America/New_York` with `Intl.DateTimeFormat`, never with a fixed UTC offset. Grey
the whole thing out on CME holidays.

### 2.2 Pre-trade checklist

Bias, draw on liquidity, PD array, killzone, risk — all ticked before the journal will accept an
entry. This reads as friction because it is friction; it is also the discipline the mentorship is
actually selling. The statistics page then compares checklist-complete trades against the impulsive
ones, which settles the argument empirically rather than by assertion.

### 2.3 CBDR / Asian range calculator

Paste the 14:00–20:00 high and low and the 20:00–00:00 high and low; get the widths, the midline,
and the deviation ladder. Then the two qualifiers the model actually states: is the CBDR under its
threshold, is the Asian range inside its band. When both fail, the model's own answer is to stand
down, and having that said by a tool rather than by willpower is the point.

The indicator in the private `the-mentorship-pine` repo already draws this on a chart. The page
exists for planning away from the chart and for logging the numbers into the journal.

### 2.5 Broker CSV import — **built** (`import.html`)

**The one that unblocks everything else at scale.** A member running seventeen copied prop accounts
cannot hand-log the same trade seventeen times, and that is the case actually in front of us.

[IMPORTS.md](IMPORTS.md) is the research: what each platform exports, where the button hides, and
what it silently leaves out. Build against the **Tradovate Orders CSV** first — one file, whole date
range, per account, and the most likely source.

The schema is already shaped for it. `account`, `fees`, `net_pnl` and `trade_exits` map onto what a
broker export carries, and `net_pnl` means an import needs no entry or stop prices to produce a
usable calendar.

Import every account rather than deduplicating the copies. They are near-identical by design, so
collapsing them hides the only thing worth knowing — the one account that diverged.

### 2.4 Rollover and event calendar

Quarterly roll — March, June, September, December, with volume rolling around the second Thursday,
roughly eight days before expiry — catches newer traders every single quarter. Combine with FOMC,
CPI and NFP dates and a no-trade window marker. A static JSON file in the repo, refreshed quarterly.

---

## Phase 3 — the ES/NQ-specific work

### 3.1 SMT divergence checker — **built** (`smt.html`)

The one tool that only makes sense for these two instruments, and already described in
`structure.html`. Feed it the ES and NQ session highs and lows; it reports which index failed to
confirm and when. A manual version where the member types four numbers is genuinely useful on its
own. A daily-bar version behind a Supabase Edge Function — so the data key never reaches the
browser — makes it a morning habit.

### 3.2 Chart-marking drills

An uploaded, anonymised chart image; the member marks where the fair value gap, the structure shift
or the order block is; the marked answer is revealed after, and the attempt is scored and tracked.
Reps instead of rereading. Uses the private bucket and the existing inline-SVG convention.

### 3.3 Backtest logbook

The same schema as the journal, a separate table, and a visible sample-size counter: *fourteen of
the hundred instances before this number means anything.* The counter is the feature.

### 3.4 Glossary spaced repetition

Ninety-odd terms with one-sentence definitions already exist in `glossary.html`. That is a card deck
sitting there for free.

---

## Phase 4 — TradingView

Chart-side tooling lives in the private `the-mentorship-pine` repository, not here. It carries
entry, stop and target logic, and this repo publishes itself to the web.

| Script | Status | What it does |
| --- | --- | --- |
| `trade-karma-day-model.pine` | **built** | Context plus setups: bias-side session ranges and deviations, true-midnight PDH/PDL, ADR; then sweep → displacement → fair value gap → limit entry with stop and target, and a running R tally for forward testing |
| `trade-karma-setup-state.pine` | folded in | The state machine now lives inside `trade-karma-day-model.pine` — keeping the narrative in a second indicator meant two panels disagreeing about the same day |
| `trade-karma-day-model-strategy.pine` | planned | The same logic as a `strategy()`, so the built-in Strategy Tester can backtest what the indicator forward-tests |
| `trade-karma-smt.pine` | planned | ES against NQ via `request.security`, flagging the index that failed to confirm at a session extreme |
| `trade-karma-journal-bridge.pine` | planned | At 16:00, emits the day's measured values as a JSON alert payload |

### The bridge

`trade-karma-journal-bridge.pine` is the piece that makes the two halves one system. A TradingView alert
fires a webhook carrying the day's numbers — CBDR width, Asian range width, which session posted the
high and the low, deviations reached, ADR consumed — at a Supabase Edge Function, which writes them
into the journal as the day's market context. The member then adds their trades against a day that
is already described.

Without it, every member retypes the same eight numbers every evening, and most of them stop.

---

## The redesign — a long-lived branch, not a phase

`ui-overhaul` is where the visual system is being rebuilt: finance rather than terminal, a crimson
mark, a theme toggle (`theme.js`) and a table of contents (`contents.js`). Will Jedrzejczak (`wjed`)
works on it; it merges into `main` when Kag3 decides it is ready, not on any schedule.

It is deliberately **not** numbered alongside the tools above. Those are features that ship once and
are done. This one is continuous — the look will keep changing after the first merge, and giving it
a phase number would imply a finish line that does not exist.

### How the two sides stay out of each other's way

**Will owns presentation. Kag3 owns behaviour.** In practice that means `style.css`, `design.html`,
the markup inside pages, and the two new scripts belong to the branch. Anything under `supabase/`,
the query and write paths in `app.js`, and new pages belong to `main`.

Neither side is enforced by anything, so it holds only as long as both remember it. The cost of
forgetting is a merge conflict in a three-thousand-line stylesheet, which is why it is written down.

**Rebase the branch onto `main` regularly — weekly is plenty.** The branch was cut at `5b7076e` on
5 August and by the next day `main` had gained the calendar, the importer, four migrations and a
Pages workflow. None of those pages exist on the branch, so their links 404 when it is served, and
every day the branch sits still is more stylesheet to reconcile later. Rebasing often turns one
unmanageable merge into a series of small ones.

**A new page on `main` arrives unstyled on the branch.** Whoever adds one should say so, so the
branch can pick it up rather than discovering it at merge time.

### Running it locally

No build step, so it is a static server and a browser. A worktree keeps `main` checked out at the
same time:

```
git worktree add ../the-mentorship-ui ui-overhaul
cd ../the-mentorship-ui && python -m http.server 8765
```

Sign-in will not work against `127.0.0.1` — Supabase's redirect URLs point at the GitHub Pages
address. The public pages, the sizer, the clock and the SMT checker all work; anything behind a
login needs the deployed site.

### Before merging

- Rebase onto `main` first, so the conflicts are resolved in the branch rather than in a merge
  commit nobody can read afterwards.
- Check `design.html` renders every component, including the ones added on `main` since the branch
  was cut. It is the visual regression check and it is the first place a broken token shows up.
- Confirm no page lost its `#auth-root` div or its `requireRole` call. A gate that vanishes during a
  restyle is invisible until somebody who should not be reading a lesson reads one — and the
  database still refuses them, but the page will have promised otherwise.

---

## Not doing

- **Live charts.** TradingView is better at this than we will ever be, and the data licensing alone
  would exceed the cost of everything else here combined.
- **Broker integration or auto-execution.** A different product, a different regulatory posture, and
  a different kind of bad day when it breaks.
- **Signals, alerts to members, or a trade-copy feed.** The whole premise of the public pages is that
  a trader should be able to read the market themselves. A signal feed contradicts that, and it is
  the thing that turns an education business into something else.
- **Gating the seven concept pages.** They are files in a public repository. Any gate on them would
  be decorative, as `README.md` already explains.
