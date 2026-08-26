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

---

## 2026-08-06 — The install video is a setting, not markup

**Decided:** the indicators page reads its walkthrough video URL from a new `settings` key/value
table, editable from the admin page.

**Instead of:** hardcoding the URL in `scripts.html`.

**Why:** swapping a tutorial video should not need a commit and a deploy. The table is deliberately
tiny and is for values that are genuinely just a string — anything structural belongs in a real
column on a real table.

The admin field validates with `youtubeId()`, the same parser the members page embeds with, so it
reports whether the link will actually render rather than whether it looks like a URL. Saving an
unembeddable link is refused, because the failure mode otherwise is a silent gap on a members page
nobody would notice.

`getSetting()` returns null on every failure — missing table, missing key, no permission. Callers
are decorating pages that must render without it.

---

## 2026-08-06 — Admin is tabbed, not split into pages

**Decided:** `admin.html` keeps all five sections in one document, shown one at a time by a sticky
tab bar. A hash deep-links a tab; otherwise the last tab used is remembered.

**Instead of:** splitting into `admin-accounts.html`, `admin-scripts.html` and so on.

**Why:** separate pages would mean five copies of the auth gate, five round trips, and a full reload
between two jobs that are often done together — approving an account and then publishing the entry
they asked about. Everything still loads in one pass behind one role check; the tabs only decide
what is on screen, so moving away and back cannot lose an in-progress edit or refetch anything.

The hash beats the remembered tab deliberately: a link someone sends should land where it says
rather than wherever that browser was last.

**Generalises past auth.** This is the second time a silent state has cost a session - the
statistics page showing "nothing to measure" when a trade existed was the same shape. An
unreachable state and a slow one look identical if neither writes to the page, so both a deadline
and a placeholder are required, not optional.
---

## 2026-08-06 — Change one column, write one column

**Decided:** the lessons table edits `sort_order` and `published` in place, each writing a single
column. The full form omits `body_html` unless the body actually changed.

**Instead of:** routing every edit through the form, which rewrote the entire row including the
body.

**Why:** reordering an entry produced `canceling statement due to statement timeout`. Changing one
integer was rewriting the largest column in the table and holding a row lock for the duration. The
schema was not at fault — the index and policies are fine — the write was simply far larger than
the change.

The baseline for "did the body change" is captured through `bodyForStorage()` after image
hydration, not from the raw column. Comparing against the raw value would report a change on every
edit, because hydration adds signed `src` attributes that the stored form does not have.

A statement timeout is also now translated on the way out. The raw message reads like data loss and
is the opposite: the transaction rolled back, so the row is exactly as it was.

---

## 2026-08-06 — The confirmation link is derived, not configured

**Decided:** `signUp()` passes `emailRedirectTo`, built from the page the signup happened on.
Password reset uses the same helper.

**Instead of:** letting both fall back to the Supabase dashboard **Site URL**.

**Why:** Site URL is a single setting, in a different system, that has to stay in step with where
the site is deployed — and it has broken signup twice. When it lacks the repository path the
confirmation link points at the root of `github.io`, which belongs to a user-site repo that does not
exist. GitHub serves its own 404 there and nothing in this repository can intercept it. The email
looks correct and is dead on arrival.

Deriving it from `location` removes the setting from the path entirely: right on the live site,
right on a local file, right on any future host, with nothing to keep in step.

`confirmUrl()` strips the last path segment rather than matching `login.html` specifically. The
previous reset-only version matched the filename, so from any other page it produced
`index.htmllogin.html`. Latent, because reset only ran from login.html — and it would have become
real the moment that changed.

**Site URL still matters** as the fallback for anything that does not pass a redirect, so it should
stay correct. It is no longer the only thing standing between a new member and a 404.

---

## 2026-08-06 — Dollars are derived, never stored

**Decided:** the journal and calendar compute ticks and dollars from the symbol, the points and the
contract count. No `dollars` column.

**Instead of:** storing a dollar figure on the row alongside `points` and `r_multiple`.

**Why:** the same argument that keeps points and R derived. A stored dollar figure is a second
version of the truth that can disagree with the prices it came from — and it would be wrong
permanently the first time a contract spec were corrected.

`CONTRACTS` now lives in `app.js` rather than in `sizer.html`, because the moment a second page
needed it the two copies would have drifted and two pages would have disagreed about what a trade
was worth.

**Known limit:** a trade in a symbol with no spec shows points and R but no ticks or dollars. That is
the honest answer — the site does not know what a point of it is worth — and the calendar says so
rather than silently totalling a partial month.

---

## 2026-08-06 — The checklist comes first in the form

**Decided:** the pre-trade checklist sits at the top of the journal form, above the trade details.

**Instead of:** near the bottom, where it shipped.

**Why:** it is a *pre*-trade checklist. Below the exit price it reads as one more thing to fill in
after the fact, which is exactly the reconstruction-from-memory the checklist exists to detect.
Nothing enforces the order — a member can still scroll past it — but the first thing on the form is
the thing that was supposed to happen first.

---

## 2026-08-06 — The calendar groups by local day, not UTC

**Decided:** trades are bucketed with a local-time date key.

**Instead of:** `toISOString().slice(0, 10)`, which is the obvious one-liner.

**Why:** a trade at 23:30 New York is that day's trade. `toISOString()` files it under tomorrow, so
an evening trade would land on the wrong square and two days would both be wrong — the day that
lost it and the day that gained it. Verified: the same timestamp gives 2026-08-05 locally and
2026-08-06 in UTC.

Green and red are counted **per day, not per trade**, because that is the question a calendar
answers. Colour never carries meaning alone; every coloured square also shows its number.

---

## 2026-08-06 — A trade records how it came off, not just where

**Decided:** exits are rows in `trade_exits` — quantity, price and a note per fill. Their weighted
average is written back to `trades.exit_price`, and `contracts` becomes the size that actually
closed.

**Instead of:** a single exit price, which is what shipped.

**Why:** two off at the first target and a runner to the second is a different trade from four at
one price, and it is the difference most worth reviewing. A single price flattens that away and the
journal can never show it again.

The weighted average is exact, not a convenience:

    sum((price_i - entry) * size_i) === (weightedAvg - entry) * sum(size_i)

so `points`, `r_multiple`, the statistics page and the calendar all keep reading the columns they
already read, with no aggregate query and no second version of the result. Verified both directions:
a 2+1 scale-out on NQ gives $4,000 whether computed from the weighted average or by summing each
fill.

**Fees are typed, and they are the only thing that is.** Commission cannot be derived from the
prices, which is precisely why it is an input rather than a violation of "derived, never typed".
Gross and net are both shown when fees are present, so the difference is visible rather than folded
away.

**Ownership is inherited, not duplicated.** `trade_exits` has no `user_id`; every policy reaches
through to the parent trade. A second copy of the owner could disagree with the first, and the one
that mattered would be whichever the policy happened to check.

**Old trades are not migrated.** A trade logged before fills existed has none, so the form
reconstructs one row from its stored exit price when opened for editing. Nothing is rewritten in the
database unless the member saves.

---

## 2026-08-06 — A reported dollar figure beats the derived one

**Decided:** `trades.net_pnl` holds the result as the account reports it. When present it wins;
both are kept, and the journal says so when they disagree.

**Instead of:** deriving dollars from prices only, or replacing the derived figure entirely.

**Why:** the derived number is a model of the trade; the account statement is what happened. They
part company over slippage, an unrecorded partial, or a typo — and every one of those is worth
seeing rather than smoothing away. Someone reconciling a prop account at the end of the day has a
dollar figure and no interest in re-entering four fill prices to make the journal accept it, so a
typed result now stands on its own with no prices at all.

This does not reopen "derived, never typed". That rule exists so a stored number cannot contradict
the prices it came from. Here the two are different claims about different things, and the
disagreement is the feature.

---

## 2026-08-06 — Trades carry an account

**Decided:** `trades.account`, free text with suggestions built from what has already been used.
The calendar filters by it and breaks the month down per account; the statistics page slices by it.

**Instead of:** an accounts table with sizes, firms and rules.

**Why:** the question being asked is "how did each account do", which needs a label and nothing
else. Free text matches how `model` and `session_kz` already work, and the datalist is what keeps
"Apex 50k" from drifting into "apex 50K" and quietly splitting a total in half. The account also
persists between saves, because the next trade is almost always in the same one.

---

## 2026-08-06 — Number(null) is 0, and that is a bug factory

**Decided:** `toNumber()` returns NaN for null, undefined and empty string. Everything optional goes
through it, and `hasResult()` is the single predicate for "this trade has a result".

**Why:** found by testing, not by reading. `Number(null) === 0`, so a trade with no prices reported a
derived result of **$0.00** and then flagged a false disagreement against the figure its owner had
actually typed — and the calendar counted a row with neither an R multiple nor a reported figure as
a valid result. Both would have shown plausible wrong numbers rather than failing.

A genuine zero still counts: a scratch is a result, not a missing one.

---

## 2026-08-06 — Import from the Performance export, not Orders

**Decided:** `import.html` reads Tradovate's **Performance** CSV.

**Instead of:** the Orders export, which is what `IMPORTS.md` originally recommended on the strength
of a third-party journal's guide.

**Why:** a real file settled it. The Performance export is already one row per round turn with the
P&L worked out, which is the shape of the `trades` table. The Orders export is raw fills that an
importer would have to match into round turns itself. The original advice is correct for importers
that want fills; this one does not.

**Direction is derived from the fill order, not the prices.** A short sells first, so `soldTimestamp`
precedes `boughtTimestamp`. Reading direction off the prices would label every short a long *and
still show the right P&L*, because a round turn's profit is `sell − buy` either way. Nothing
downstream would ever flag it.

**De-duplication is on the broker's own ids.** `buyFillId-sellFillId` is unique per round turn and
stable across exports, so re-importing an overlapping range corrects rows rather than doubling a
month. Unique per user, not globally — two members exporting the same copied account would otherwise
collide.

**The file verified the contract table.** $40.00 over 2 points on 1 NQ contract is $20 per point,
matching `CONTRACTS.NQ.perPoint`. First real-world confirmation of a table that had only ever been
checked against documentation.

---

## 2026-08-06 - The importer maps columns rather than knowing formats

**Decided:** `import.html` matches a file's headers against a synonym list, shows what it matched,
and lets every field be reassigned by hand. Three fields are required - when, what, and which way.

**Instead of:** one parser per platform, which is what shipped and what `IMPORTS.md` recommended
after a day of research into six of them.

**Why:** the per-platform parser is wrong the first time somebody arrives with a seventh. It also
fails silently in the worst way available - a column order that shifted by one in a vendor update
still parses, and every price is quietly off by a field. Mapping puts the file's own first value
beside each choice, so a date landing on a price is visible before anything is written rather than
after.

Recognition still does the work in practice. A Tradovate export needs nothing touched; so does the
template. Recognition is the convenience and the mapping is the mechanism, not the other way round.

**What is deliberately not inferred:**

Direction is never read from the prices. For a paired-fill export it comes from which fill was
first, and everywhere else from a column. Prices alone call every short a long, the profit still
comes out right, and nothing ever flags it.

A missing side, date or symbol refuses the row and says which, rather than defaulting. The column is
`not null default 'long'`, so a guess would be indistinguishable from a fact.

Ambiguous dates are settled once for the whole file, by looking for any day above the twelfth, and
the reading is announced on screen. Deciding per row would mix two calendars in one import.

**Known limit:** side values are read in English, plus the signed-number convention. A platform
exporting "Venta" refuses the row and says so, which is recoverable; guessing at it would not be.

---

## 2026-08-06 - Files without an identifier get a derived one

**Decided:** when no id column is mapped, `external_id` is a hash of the trade's own details, and
the page says so.

**Instead of:** leaving it null and inserting.

**Why:** re-importing an overlapping range is the normal case, not the exception, and null
external_id means every re-import doubles the month. The cost is real and stated on screen: two
genuinely separate trades with identical instrument, time, prices and size arrive as one.

Duplicates are also collapsed **before** the write. Postgres refuses an upsert whose payload touches
the same key twice, and the error it gives for it - "command cannot affect row a second time" -
explains nothing to a member holding a broker export.

---

## 2026-08-06 - Excel is read, but only when an Excel file is opened

**Decided:** `.xlsx` and `.xls` are supported through SheetJS, imported dynamically the first
time a spreadsheet is actually chosen.

**Instead of:** CSV only, or loading the reader on every visit.

**Why:** members keeping their own records keep them in Excel, and "save as CSV first" is the kind
of instruction that stops people using a tool. The dynamic import keeps the cost off everybody who
brings a CSV, which is what a broker export is.

Delimited files are still parsed by hand rather than through the same library. It is fifty lines,
it already existed, and it works when a CDN does not.
---

## 2026-08-10 - The concept pages stay public, and the front page sells the members area

**Decided:** `index.html` is rewritten as a landing page that names the two halves - free concepts,
paid measurement. The seven concept pages stay open.

**Instead of:** putting the concept pages behind `requireRole`, which is what was asked for.

**Why:** it would not have worked, and it would have looked like it did. This repository is public,
so `raw.githubusercontent.com` serves `liquidity.html` to anyone right now, no login. Checked, not
assumed: it returns 200. A gate on those pages hides the content from members who have paid while
leaving it available to anyone with the repo URL - the worst of both, and a false claim of privacy
made to paying customers.

Three things would actually gate content. Moving it into Supabase as lesson rows behind RLS, which
works and is a large job. Making the repo private, which stops the raw URLs but not Pages, since the
published site still serves the same HTML. A JavaScript gate, which stops nothing. Only the first is
real, and `README.md` has said so since the beginning.

**The commercial argument, which is separate and also mattered.** The vocabulary is free in a dozen
places, so charging for it means competing with free while removing the only thing a stranger can
evaluate the writing by. What is actually scarce here is the journal, the statistics over it, the
importer and the indicators - none of which can be found elsewhere and none of which a member can
take with them. The pages are the funnel; the tooling is the product.

**Left open deliberately:** the page names no price and promises no recurring service. Kag3 asked for
the offer to stay vague until the commercial side is decided, so nothing on the page commits him to
delivering anything on a schedule.

**Recorded as a standing risk:** if the concept pages are ever gated, this entry is the argument
against doing it with JavaScript, and the migration into the database is the only version worth
building.


---

## 2026-08-12 - Journal screenshots are made private with a RESTRICTIVE policy, not a second bucket

**Decided:** trade screenshots stay in the `lesson-media` bucket under `journal/<user id>/`, and the
privacy that `trades.sql` only claimed is made real by a RESTRICTIVE policy on `storage.objects` in
`supabase/journal-media-privacy.sql`, plus an admin read that mirrors `shared_with_mentor` on the
trades table.

**Instead of:** moving journal media into its own bucket, which is the obvious structural answer.

**Why:** the bug first. `trades.sql` said its journal policies "narrow" the bucket's member-wide read
policy. A permissive policy cannot narrow anything - Postgres OR's permissive policies for the same
command, so the journal policy only added a second way in, and every signed-in member could read
every other member's trade screenshots. The uuid in the filename was the only thing between them,
which is obscurity, not access control. Signed URLs did not help: Supabase checks the caller may
SELECT the object before minting one.

A separate bucket would make the mistake unrepeatable, and it was the better answer if the site were
starting from empty. It is not. `storage.objects` rows point at bytes stored under their bucket, so
no SQL statement moves an object across buckets; a client-side copy would be needed, and then every
`trades.screenshot_path` would have to be rewritten - on rows that admins deliberately cannot update.
Granting that write to run the migration would trade a read hole for a write hole, in the one table
where "nobody can edit your journal but you" is the promise.

The restrictive policy buys the same property for the objects that already exist. Restrictive
policies are AND'd rather than OR'd, so a permissive policy written years from now granting the whole
bucket still cannot reach anything under `journal/`. That is precisely what the second bucket was
wanted for.

**Two things that came out of writing it, and are worth keeping in mind.** A rename is an UPDATE, so
an admin update policy covering `journal/` was a read bypass with extra steps - moving a file to
`lessons/` publishes it. That policy is now carved out in `storage.sql` itself, since a migration
that only adds a file leaves the old one to undo it on the next re-run. And the mentor's access is
per object, resolved through the flagged trade that points at it, so unticking *share with mentor*
takes the screenshot back as well as the row.

**The standing rule this leaves:** in this project, a policy that is meant to take something away
must say `as restrictive`. A permissive one is always an addition, however narrowly it reads.

---

## 2026-08-13 — The reply editor stores Markdown, not HTML, and does not reuse Quill

**Decision:** a small hand-written WYSIWYG (`editor.js`) for mentor replies and member questions,
storing Markdown in `trade_reviews.body`.

**Instead of:** the pattern this repo already has. `admin.html` loads Quill from a CDN for lesson
bodies, stores HTML in `lessons.body_html`, and `lesson.html` runs it through DOMPurify on render.
Reusing that would have been the consistent choice, and consistency is worth something.

**Why not:** the direction of trust is the opposite one, and that changes the answer.

A lesson is written by an admin and read by members. Sanitising it protects members from an account
that is already trusted with more than the lesson body. A reply is written by a **member** and read
inside the admin page — the one session that can read every shared trade, write as the mentor, and
change roles. A stored XSS there is not a defaced page; it is the whole site.

Storing Markdown removes the class rather than filtering it. The column holds text, so nothing in the
table can become executable however a future render is written. `editor.js` is a whitelist by
construction rather than a blacklist: unrecognised nodes contribute their text and nothing else, so
there is no list of dangerous things to keep current. And plain-text replies written before any of
this render unchanged, which a JSON document model would not have managed.

**The costs, stated rather than glossed over.** Two rich-text mechanisms now exist in one repo, and
somebody will eventually have to decide whether lessons should move too. The reply editor supports
seven things and no images. `document.execCommand` is deprecated — it is the only way to get WYSIWYG
without a framework, and if it is ever removed only `mountEditor` changes, because nothing downstream
reads that DOM except the serialiser.

**The rule this leaves:** rich text written by one class of user and rendered to a more privileged
one is stored as text. Rich text flowing the other way may keep the Quill and DOMPurify pattern.

**Still open:** whether `lessons.body_html` should follow. It is admin-authored, so the risk is far
lower, but "admin-authored" is an assumption about accounts rather than a property of the schema.

---

## 2026-08-13 (later) — Editor.js replaces the hand-written editor, and the rule survives it

**Decision:** the reply box is `codex-team/editor.js`, pinned, loaded from a CDN as ES modules and
mounted on first click. `trade_reviews.body` holds its JSON document.

**This supersedes the entry above it, on the same day.** That entry said the reply editor was
hand-written and stored Markdown. The hand-written part is gone; the reason it existed is not.

**What did not change, and is the point.** The rule was never "store Markdown". It was: *rich text
written by one class of user and rendered to a more privileged one must not reach `innerHTML` as
markup.* Editor.js satisfies that better than Markdown did, because it saves structured data instead
of a string, and this file decides what tags that data may become.

**What is new, and worth being clear-eyed about.** Editor.js stores the inline formatting inside a
block as an HTML fragment: `{ "text": "the <b>stop</b>" }`. It is tempting to treat that as safe
because Editor.js only ever writes `<b>`, `<i>`, `<a>`, `<code>` and `<mark>` into it — and that
reasoning is wrong. **Editor.js is not what sends the row.** The browser is, and the member owns the
browser: anybody can post a block whose `text` is `<img src=x onerror=…>` straight to PostgREST with
their own publishable key. So the fragment is parsed into an inert `<template>` and re-emitted
through a whitelist, tag in and tag out, with no attributes copied. The whitelist is the guarantee.
The library is a convenience.

**Why it loads late.** The library and its three tools are eight requests and about two seconds to
`isReady` cold. The Review tab renders ten cards and the journal fifty rows, each with a box. One
editor per box on render is most of a minute spent building controls nobody may use. A box is a
plain surface until it is clicked; the modules are fetched on idle so that click is normally
instant. Both surfaces share a `min-height` and a left gutter, because a box that resizes when the
editor arrives turns a lazy load into a glitch — measured at 67px against 29px before that was
fixed.

**The version is pinned rather than ranged.** A `^2.31` would let a CDN serve this site a different
editor on any morning with no diff and no commit. Pinning is how a project with no lockfile gets the
property a lockfile provides.

**The costs.** Editor.js is a block editor built for documents, and a reply about one trade is not a
document — every paragraph is a block with its own handles, which is heavier than a chat box wants
to be. The site now depends on a CDN for a member-facing control, where before it depended on one
only for Supabase. And there are still two rich-text mechanisms here: lessons remain Quill and
DOMPurify.

**Still open:** whether lessons should move to Editor.js too, which would leave one editor rather
than two. That is a larger change — `lessons.body_html` holds HTML and would need converting — and
it is not blocking anything.

---

## 2026-08-13 (evening) — Editor.js moves off the reply box, and onto the roadmap for lessons

**Decision:** the reply box goes back to the local editor in `editor.js`. Editor.js is not deleted
from the plan — it is reassigned to lessons, scoped in `ROADMAP.md` and not started.

**This supersedes the entry above it.** Same day, third position on the same question, which is
worth admitting rather than tidying away.

**What the experiment actually established**, since it was not wasted:

- **The library saved no code.** Local editor 544 lines; Editor.js version 565. The whitelist
  renderer had to be written either way, because a block's inline formatting is an HTML fragment
  and the browser sending it belongs to the member. The usual argument for a dependency — less code
  you own — did not apply here.
- **About eighty of those lines were pure compensation.** The placeholder shell, the idle prefetch,
  the matched `min-height`, the 56px gutter for handles that otherwise render outside the box: none
  of it is functionality. It exists because eight requests and a two-second cold start cannot be
  mounted ten times on a page. The local editor needed none of it.
- **It put a CDN in front of a member-facing control.** Before, only Supabase was a network
  dependency; a reply box that cannot load is a worse failure than one that is plainer.
- **The model is wrong for the content.** A block editor gives every paragraph a plus button and a
  drag handle. Nobody reorders the two sentences of a trade critique.

**What is kept.** `renderBody()` stays and is what both pages call. It reads Markdown, the plain
text that predates any editor, *and* Editor.js documents — so the replies written during the
experiment still render as prose rather than as a wall of JSON. It is also exactly the renderer the
lessons migration will need, which is the second reason not to delete it.

**What would flip this back:** replies wanting images or chart annotation inline. Charts are a
`chart_url` today, so they do not.

**The rule, unchanged through all three entries:** rich text written by one class of user and
rendered to a more privileged one must not reach `innerHTML` as markup. Markdown satisfies it, an
Editor.js document satisfies it, and stored HTML does not. That is the thing to hold on to when this
question comes round a fourth time.

---

## 2026-08-26 — `checklist_done = false` was two different facts, and the importer made one of them the majority

**Decided:** `checklist_done` is no longer read directly by any page. `app.js` exports
`checklistState(row)`, which returns `done`, `skipped` or `not-asked`, and `wasWrittenUp(row)`,
which asks whether anything only a person could supply is on the row.

**The problem, which nobody introduced and everybody built:** ROADMAP 2.2 assumed every trade passes
through the journal form. ROADMAP 2.5 — the importer, and correctly described there as "the one that
unblocks everything else at scale" — built the path where none of them do. The column is
`boolean not null default false`, so an imported trade is indistinguishable from a member who was
shown five checkboxes and ticked none.

Members import daily. So on a realistic journal that column reads false almost everywhere, and every
page consulting it was reporting a discipline failure where there was only a CSV:

- `admin.html` put a red **no checklist** on a mentor's screen against a member whose only act was
  using a feature this site built for them. A tag that fires on most rows also stops carrying
  information — it had become furniture long before it was noticed to be wrong.
- The **By checklist** slice on `stats.html` — the one comparison the 2026-08-05 entry protected
  from a hard gate, on the grounds that a gate would make the column stop describing reality — was
  comparing the trades somebody typed against the trades somebody did not, and calling the
  difference discipline. The importer did to that comparison exactly what a hard gate would have
  done, from the other side, and silently.
- The daily card read *"2 of 47"* on a day with 44 imports.

**How the three states are told apart,** with no migration and no new column:

- `imported_at` is null on anything typed (`trade-import.sql`: *"Null means it was typed."*).
- The judgement columns — model, PD array, liquidity, bias, management — are ones only a person
  fills in. The importer deliberately refuses to guess them. So an imported row carrying any of them
  is one the member opened in the journal, which means they saw the checklist and saved anyway.
- `notes` is deliberately **not** in that list: a journal exported from this site and read back in
  carries its own notes. `session_kz` is not either — the importer derives it from the clock.

`undefined` and `null` are treated as different answers. `admin.html` drops `imported_at` from its
select when the migration is missing, and a missing column must not be read as "typed" — that is
precisely how somebody gets flagged for a checklist they were never shown. Where there is nothing to
go on, the guess falls toward `not-asked`.

**Two real bugs found on the way, both from the same mechanism.** `upsert` writes every key in the
payload, on insert *and* on conflict. The importer was sending `checklist_done: false`, `notes`,
`stop` and `target` on every row:

- **Re-importing wiped a hand-ticked checklist.** The member most likely to go back and write their
  trades up was the one whose work was destroyed every time they imported. Re-importing is the
  normal case — exports are date ranges and date ranges overlap; the whole reason `external_id`
  exists is so August can be run twice.
- **It also wiped hand-typed stops, targets and notes,** because a Tradovate orders file has no such
  columns and an absent column reads as null.

The fix is to omit them. `checklist_done boolean not null default false` then does the right thing
by itself: a DEFAULT fires on INSERT and never on `ON CONFLICT DO UPDATE`, so a new row gets false —
true, nobody was asked — and an existing row is left alone.

That makes the payload ragged, and PostgREST refuses a ragged batch (`PGRST102 All object keys must
match`), so the write now groups rows by key signature and sends one request per shape. In practice
that is one or two: a broker export is uniform, and a journal re-export is uniform the other way.
The mixed case is the one that used to fail outright.

**What is now derivable, which is the thing worth keeping:** the importer cannot record a reason,
so an imported journal is a complete record of results and an empty record of decisions. That is not
a moral failure and is not drawn as one. It is stated where it has consequences — a **Written up**
card on the daily panel, a callout above the slices explaining why six of the eight sections have
vanished — and it is asked as a question the gate can actually answer: *do the decisions you took
the trouble to write up finish differently from the ones you only imported?* The permutation shuffles
labels within a day, so only days holding both kinds inform the answer, which removes "started
journaling in July" for free. It cannot remove that the member chose which trades to write up, and
the finding says so in its own text.

**Reversible:** `checklistState` is twelve lines in `app.js` and four call sites. If the mentorship
decides an imported trade *should* count as a skipped checklist, change the function.

**Known limit:** a member who imports, opens a trade, fills in the model and does not tick the boxes
reads as `skipped` — correct — but one who opens a trade, ticks nothing and fills in nothing reads
as `not-asked`, and they were asked. There is no column recording that the form was opened. The
error is in the direction of not accusing anybody, which is the direction chosen deliberately.
