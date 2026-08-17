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

## The redesign — landed, and still running

**Will Jedrzejczak's visual system is the site's, as of 10 August 2026** — commit `a113c65`. His
stylesheet, his chrome, his light and dark themes. `ui-overhaul` is not a pending merge any more; it
is where the next round of presentation work happens.

It is deliberately **not** numbered alongside the tools above. Those ship once and are done. This one
is continuous — the look will keep changing, and a phase number would imply a finish line that does
not exist.

### What the first integration actually cost, which is worth knowing before the next one

Thirty-five commits of divergence, and a stylesheet rewritten 2,049 lines up and 1,001 down against
the 372 `main` had added. It read as a painful merge and was not one, for a reason that is entirely
Will's doing: **he kept an alias layer.** `--bg` still resolves, to `var(--page)`; `--fg` to
`var(--ink-700)`. So every rule written against the old token names kept working against the new
palette.

Measured rather than assumed, before a line was moved:

| Check | Result |
| --- | --- |
| Tokens `main`'s newer CSS uses that his file defines | 27 of 27 |
| His selectors colliding with `main`'s new components | 0 of 25 |
| Selectors his rewrite dropped that a page still uses | 0 |

That is what made "take his stylesheet whole and append `main`'s components" safe. **Run those three
checks again next time** rather than trusting that it will hold — the alias layer is a convention, and
nothing enforces it.

One thing did not survive: `main`'s `a.btn-primary` override, which hardcoded a near-black against
the old dark palette. Under a light theme it would have been unreadable, which is the exact failure
the token system exists to prevent. Anything that hardcodes a colour is a light-mode bug waiting to
be filed.

### The theme switch, and why it is built the way it is

Three states, not two. Unset **follows the operating system and keeps following it**; only a
deliberate toggle pins light or dark. Returning to "follow the system" is not on the button, because
a third state that looks identical to one of the other two is a control nobody can read — clearing
`tk_theme` in devtools restores it.

`theme.js` is a **classic script in `<head>`, not a module**, and that is load-bearing. A module is
deferred, so it would run after first paint: the page would render in the wrong theme and visibly
flip. Anyone tidying it into a module will reintroduce that.

Dark is declared twice, under `prefers-color-scheme` and under `[data-theme="dark"]`. That
duplication is what makes both "follow the system" and "pinned" work, and it is not redundancy to be
cleaned up.

### How the two sides stay out of each other's way

**Will owns presentation. Kag3 owns behaviour.** `style.css`, `design.html`, the markup inside pages,
`theme.js` and `contents.js` belong to the branch. Anything under `supabase/`, the query and write
paths in `app.js`, and new pages belong to `main`.

Neither side is enforced by anything, so it holds only as long as both remember it. The cost of
forgetting is a conflict in a three-thousand-line stylesheet.

**Reset the branch onto `main` before starting the next round.** It currently sits behind a `main`
that contains its own work, so continuing on it as-is means conflicting with himself:

```
git fetch origin && git checkout ui-overhaul && git reset --hard origin/main
```

**Rebase weekly after that.** The first branch was cut on 5 August and by the next day `main` had
gained the calendar, the importer, four migrations and a Pages workflow — none of which existed on
the branch, so their links 404 when it is served. Rebasing often turns one unmanageable merge into a
series of small ones.

**A new page on `main` arrives unstyled on the branch.** Whoever adds one should say so.

### Running it locally

No build step, so it is a static server and a browser. A worktree keeps `main` checked out at the
same time:

```
git worktree add ../the-mentorship-ui ui-overhaul
cd ../the-mentorship-ui && python -m http.server 8765
```

Sign-in will not work against `127.0.0.1` — Supabase's redirect URLs point at the GitHub Pages
address. The public pages, the sizer, the clock and the SMT checker all work; anything behind a login
needs the deployed site.

### Before merging the next round

- Rebase onto `main` first, so conflicts are resolved in the branch rather than in a merge commit
  nobody can read afterwards.
- Re-run the three compatibility checks above. They passed once; that is not a guarantee.
- **Look at every page in both themes.** The first integration was verified structurally — chrome
  applied once per page, auth gates intact, markup balanced, tokens resolving — and not one page was
  looked at rendered. Anything hardcoding a colour, and any diagram whose SVG carries fixed fills,
  is where light mode will break first.
- Check `design.html` renders every component. It is the visual regression check and the first place
  a broken token shows up.
- Confirm no page lost its `#auth-root` div or its `requireRole` call. A gate that vanishes during a
  restyle is invisible until somebody who should not be reading a lesson reads one — the database
  still refuses them, but the page will have promised otherwise.

---

## One editor, not two — scoped, not started

The site has two rich-text mechanisms and should have one. Lessons use **Quill**, store HTML in
`lessons.body_html`, and are sanitised with **DOMPurify** on render. The reply box uses the local
editor in `editor.js`, stores Markdown, and is whitelisted on render.

For one afternoon on 13 August 2026 the reply box ran **Editor.js**, and moving it back is what
produced this entry. `DECISIONS.md` has the full reasoning; the short version is that Editor.js is a
good library that was in the wrong place. A reply is a sentence about one trade, and a block editor
gives every sentence a plus button and a drag handle nobody will use. It cost eight CDN requests, a
two-second cold start, and about eighty lines of placeholder-and-gutter machinery whose only job was
to make a document editor feel like an inline box — while saving no code at all, because the
whitelist renderer had to be written either way.

**But lessons are the case it was built for**, and that is the piece worth doing:

- Long-form, block-structured, image-carrying, written by one person. The plus button and the drag
  handle are the feature there, not overhead.
- It would retire Quill, leaving one editor library instead of two.
- It would retire the weaker of the two security patterns. Storing JSON and whitelisting on render
  beats storing HTML and sanitising on render, and `renderBody()` in `editor.js` is already that
  renderer — it reads Editor.js documents today, for the replies written during the experiment.
- Page weight stops mattering: one editor, admin only, and `lesson.html` renders rather than edits.

### What makes it a session rather than an hour

- **`lessons.body_html` holds HTML on every existing lesson**, thirteen in Prerequisites alone. They
  need converting to blocks, or `lesson.html` needs to render both formats the way `renderBody()`
  already does for replies. The second is cheaper and reversible; do that first.
- **Image handling is the risky part.** The Quill flow already does paste-to-upload plus a save-time
  sweep for inline base64 — which exists because embedding images as data URIs once caused a
  statement timeout on save. `@editorjs/image` needs wiring to the same Supabase bucket and the same
  policies, and getting that wrong is a broken lesson rather than a cosmetic fault.
- **`admin.html` references `quill` in about thirty places.** Mechanical, but not small.

### The order

Render both formats in `lesson.html` first, then switch the editor, then convert the stored rows
last — or never, if dual rendering turns out to be enough. Nothing about this is urgent, and it
should not start at the end of a long session.

---

## Phase 5 — the community layer

Three pieces asked for on 13 August 2026. They are listed in dependency order, which is also
cheapest-first: **5.1 stands alone, 5.3 needs 5.2, and 5.2 is the expensive one.** None is started.

### 5.0 Notices — **built**

A message of the day at the top of the members area, written from the admin Settings tab and stored
as a key in `settings` — no table, because settings.sql exists for exactly this. It uses the reply
editor and the same whitelist renderer, which matters more here than anywhere: that one string is
written once and rendered into every member's browser.

Beside it, and only ever seen by an admin, a derived notice saying how many shared trades are
waiting, with a link into the queue. The masthead badge says *that* there is work; this says *what*.

The member has the mirror of it: a **Sent for review** tab on the journal, and a tag on every
shared row saying *awaiting reply* or *replied*. It uses the same `isWaitingForMentor` the mentor's
queue does, imported rather than rewritten — a journal reading "replied" while the queue still
shows the trade as owed would be the two pages disagreeing about one fact.

### 5.1 Who is still turning up — attrition on the admin side — **level one built**

**The honest answer to "can we do this today" is no, and the reason is worth knowing.** `profiles`
carries `created_at` and nothing else about a member's life. Supabase does record
`auth.users.last_sign_in_at`, but reading `auth.users` needs the `service_role` key, and a static
site has nowhere to keep one — the same wall the admin password-reset feature hit, recorded in
`supabase/RUN-THESE.md`. So the site has to record this itself.

**Two levels, and the first is worth having on its own.**

*Level one — `profiles.last_seen_at`.* One column, one policy letting a member update their own, and
a throttled write from `app.js` on page load. It answers the only question attrition really asks:
who has stopped coming, and when did they stop. An admin list sorted by that column, with the gap in
days beside each name, is most of the value of this whole item.

Throttle it to one write per member per day, held in `localStorage`. Fifty members opening six pages
a day is three hundred pointless writes otherwise, and the number that matters is a date.

**Level one landed on 13 August 2026**: `supabase/member-last-seen.sql`, a throttled write from `requireRole`, and a Last seen column plus an attrition line on the Accounts tab. The rest of this section is level two and is not started.

*Level two — a `member_activity` table*, one row per member per day, recording which tools were
opened. That is what answers the more useful questions: do the members who use the journal stay
longer than the ones who only read lessons, and where in the first fortnight do people fall away.
It is a cohort table, so it wants a chart rather than a list, and it should not be started until
level one has been running long enough to have something to chart.

**Three things to be straight about before building either.**

- **It is self-reported.** The client writes the timestamp, so it measures a browser opening a page.
  Somebody who leaves a tab open for a week looks identical to somebody reading every day. Good
  enough for attrition, useless for anything that would justify charging differently.
- **It measures attendance, not learning.** A member who stopped opening the site because the
  material worked and they are now trading it looks exactly like one who gave up.
- **It is member tracking, and it should say so.** Members-only, never the public concept pages, and
  the account page should be able to say plainly what is recorded. The project has been careful
  about a member's screenshots being private; their attendance deserves the same clarity.

### 5.2 Mentors as a role, questions directed at one, and a tier list

**This is the expensive one, and the cost is not the feature — it is the role.**

`profiles.role` is a CHECK constraint over `('pending', 'member', 'admin')`, and `is_admin()` is
called **36 times across 12 migration files**. Adding `mentor` means altering that constraint and
then making 36 separate decisions: does a mentor get this grant, or not? Some are obvious — a mentor
writes replies, a mentor does not change roles. Others are not, and each wrong answer is either a
mentor who cannot do their job or a mentor who can read something they should not.

**Do that audit as its own piece of work, before any feature is built on top of it.** Write
`is_mentor()` beside `is_admin()`, go through all 36 call sites in one pass, and record the ones
that were arguable in `DECISIONS.md`. A role added feature-by-feature is a role nobody can describe.

**Directing a question.** Today `trades.shared_with_mentor` is a boolean and the Review tab is a
pool. Directing it means naming a person. Put that on `trades` as a nullable `asked_of` — the member
owns that row and writes it themselves, so it does not touch the promise that nobody edits your
journal but you. `trade_reviews` already carries `author_id`, so a mentor's answer needs no schema
change at all, only a policy that lets a mentor write where an admin can.

Keep the pool. A question addressed to nobody in particular should still reach whoever is free, or
the quiet mentors get no questions and the busy ones get all of them.

**Stars, titles and a tier list — the part that needs thinking about, not just building.**

The schema is easy: a rating per answer, an aggregate per mentor. The design is not, and there are
two problems worth naming before anyone writes the table.

- **A public leaderboard rewards the wrong thing.** Ranking by answers given rewards volume; ranking
  by rating rewards agreeable answers. The most valuable critique a mentor can write is the one that
  tells somebody their setup does not work, and that is not what gets five stars. If a tier list is
  built, rank on something that cannot be farmed — answers that the member later marked as having
  changed what they did, say — rather than on a thumbs-up.
- **It changes what the site is.** `CLAUDE.md` draws a hard line at *record and analyse, never
  signal*, and the footer on every page says educational content, not advice. A ranked marketplace of
  people giving trading opinions for status is closer to the other side of that line than anything
  currently here. Not a reason to refuse it — it is a reason to decide deliberately and write the
  decision down, rather than arrive there one feature at a time.

**Suggested order:** the role audit, then mentor replies, then directing a question, then ratings.
The first three are useful without the fourth.

### 5.3 Profile images, and role flags under them

**Needs 5.2 first** — the flags are the roles, so there is nothing to draw until the roles exist.

The image half is small and has one genuinely new problem in it. Every member-uploaded image on this
site so far is *private*: journal screenshots are readable by their owner and by a mentor on a shared
trade, which is what `supabase/journal-media-privacy.sql` was for. An avatar is the opposite by
design — it appears beside a name in every thread, to everybody.

- **Storage:** a separate prefix with its own policies. Readable by any signed-in member, writable
  only by the owner. Do not reuse the `journal/` rules; they exist to do the opposite thing, and a
  policy that is meant to take something away must say `as restrictive` — see `DECISIONS.md`,
  12 August.
- **Moderation is the new problem.** The first image a member uploads that other members see is the
  first time somebody can put something objectionable next to their own name across the whole site.
  Decide the answer in advance: generated initials as the default, and either upload-behind-approval
  or accept-and-remove-fast. Either is fine; discovering the question later is not.
- **Sizing:** `compressImage()` in `app.js` already exists for journal screenshots and should be
  reused rather than reinvented, at a much smaller bound — an avatar is 128px, and nobody needs a
  four-megabyte one.

The flags themselves are the easy half: a `.tag` variant per role beside the name, using the existing
token set, added to `design.html` like every other component.

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
