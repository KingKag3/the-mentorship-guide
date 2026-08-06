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

## 2026-08-05 — The interface is blue so that green can mean something

**Decided:** the brand and every interactive affordance — links, buttons, focus rings, the active
nav item, badges — use a navy/blue scale. Green and red are reserved for market direction: bull and
bear, profit and loss, and the diagrams.

**Instead of:** the terminal green (`#4ade80`) used for all of it, which is what shipped.

**Why:** the old palette used one green for the brand, the links, the buttons, the active nav item,
the focus ring, the member badge, the bullish tag *and* the bullish half of every diagram. It
appeared several hundred times on a page, which meant that by the time a reader reached a chart
where green carried actual information, green had been trained to mean nothing. On a site whose
entire subject is reading direction off a chart, that is an expensive thing to give away for a
house style.

Separating the two axes also fixes the reverse problem: a red "delete" button and a bearish
candle no longer have to be the same red by coincidence.

**This is a branch, not a merge.** It lives on `ui-overhaul` for review.

---

## 2026-08-05 — Light by default, with a real dark theme rather than a dark-only site

**Decided:** an editorial light theme is the default. A dark theme is defined token-for-token
alongside it, follows the operating system, and is pinned by a toggle in the masthead.

**Instead of:** keeping the dark-only palette, or converting to light-only.

**Why:** dark-on-black with a saturated accent is the visual grammar of a terminal, a game overlay
or a crypto landing page — it was the single largest reason the site did not read as a finance
publication. But a trading audience genuinely does work in the dark, so removing it would have
traded one complaint for another. Defining both means the default sets the tone and nobody loses
anything.

The cost is that every token is declared three times: once light, once inside
`prefers-color-scheme: dark`, once under `[data-theme="dark"]`. With no build step there is no way
around that duplication. It is why `--on-brand` exists rather than a literal `#fff` on the primary
button — the button's fill is navy in one theme and pale blue in the other, so its text colour
cannot be a constant.

**Consequence worth stating:** nothing may hardcode a colour, because a literal is now wrong in one
of the two themes by definition. That was already the rule in `CLAUDE.md`; it is now load-bearing
rather than aspirational.

---

## 2026-08-05 — Diagram colours moved out of SVG attributes into classes

**Decided:** the inline SVG diagrams carry `class="svg-f-up"` / `class="svg-s-down"` instead of
`fill="#4ade80"` / `stroke="#f87171"`. Fill and stroke are separate class namespaces; per-element
`opacity` is untouched, so the zone washes keep their individual strengths.

**Instead of:** substituting one set of hex values for another.

**Why:** a presentation attribute cannot hold a `var()`. Any hex left in the markup would have been
correct in one theme and wrong in the other, and the diagrams are the part of this site where a
wrong colour is not cosmetic — green and red *are* the content. 161 attributes across six pages
were converted mechanically.

---

## 2026-08-06 — The brand is crimson, not navy. Supersedes the entry above

**Decided:** the interface accent is the crimson from the Trade Karma mark. The navy/blue scale
decided yesterday is withdrawn.

**Instead of:** the blue, which lasted one day.

**Why:** it was chosen to be *not green* rather than to be *this brand*, and the result read as
generic — Kag3's word for it was that it looked like it came out of an AI, which is exactly right.
Default-blue-on-white is the house style of every framework starter page in existence. The actual
mark is a crimson badge on near-black with white lettering, and the site should look like it
belongs to the mark rather than to a component library.

**What survives from yesterday's entry:** the reasoning about colour volume, which was correct and
is the reason this works at all. Red is confined to the badge, the active nav item, the primary
action, links, and bearish data. Everything else is ink on white. The failure being avoided is
still the original one — an accent used for everything stops meaning anything.

**The one collision, accepted deliberately:** bearish red and the brand crimson are now the same
colour. That is not the mistake green made. Green was the brand *and* bullish *and* every button;
red here is the brand and bearish, which on a trading site are close to the same idea. Inventing a
second, slightly different red so that "danger" and "down" could be distinguished would make two
things that mean the same thing look different, which is worse.

**Two red tokens exist for contrast, not for meaning.** `--brand-solid` (`#c4262e`) is used for
anything filled and is identical in both themes, because white on it clears AA at 5.97:1 either
way. `--brand-500` is the link colour and lightens in the dark theme so it stays legible on a dark
page — white text on *that* red would fail. One token could not do both jobs.

---

## 2026-08-06 — Hairlines instead of shadows, Franklin instead of Inter

**Decided:** `--shadow-1` is `none`. Panels, cards and tables are separated by a 1px rule and
whitespace. The interface face is Libre Franklin.

**Instead of:** the layered soft shadows and Inter shipped yesterday.

**Why:** the reference points asked for were Fidelity and Merrill. What those actually have in
common is not a colour — it is restraint. Near-white pages, hairline rules, dense small print, and
a grotesque with newspaper heritage. Soft shadow under every card is the visual signature of a SaaS
dashboard, and Inter is the default UI face of the last five years of startups; both were quietly
undoing the work the palette was doing. Libre Franklin descends from Franklin Gothic, which is the
newspaper and banking grotesque, and it costs nothing to swap.

**Also added: a real disclosures block.** Every firm that handles money carries one, and its
absence is part of what makes an education site look like it is pretending. The content was already
true and already scattered across the site; it is now set as fine print at the foot of every page,
where a reader expects to find it.

---

## 2026-08-06 — Interface text is sentence case

**Decided:** "Sign in", "Sign out", "Admin", "Next: Liquidity". Not lowercase.

**Instead of:** the all-lowercase chrome, which was part of the terminal styling.

**Why:** lowercase interface labels read as a style choice on a personal site and as an unfinished
one on a site asking to be trusted with a trading education. The strings lived in
`renderAccountStrip` in `app.js` and in every pager link, so they were invisible to anyone grepping
the HTML for them.

---

## 2026-08-05 — Headings stop pretending to be markdown

**Decided:** removed `h2::before { content: "## " }`.

**Instead of:** keeping it as part of the terminal styling.

**Why:** it rendered a literal `## ` in front of every section heading on every page. Read as
intended it is a knowing reference to the markdown the content is written in; read cold — which is
how every visitor reads it — it looks like a rendering bug that nobody noticed. Someone looking at
the site for the first time asked whether it was a mistake, which is the only test that matters.
`.lesson h2` and `.phase h2` already suppressed it, so the judgement had effectively been made
twice before.

---
