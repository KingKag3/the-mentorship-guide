# Handover

State of the members-area build. Written for whoever picks this up next, including a fresh session
with no memory of how any of it got here.

Last updated: 5 August 2026, second session.

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
- **The pine code cites no rule IDs.** `CLAUDE.md` in that repo says the code cites them in
  comments. It does not — there are zero. The variable map in `implementation.md` is accurate, but
  the citation convention the append-only ID scheme exists to protect is not actually in use.
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

**First thing to do:** apply the Supabase **Site URL** fix. `SETUP.md` step 4 now specifies it, but the setting
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
- The private `the-mentorship-pine` repo, `knowledge/` — distilled ICT rules with stable IDs,
  `conflicts.md` for where the source books disagree and which won, `implementation.md` for what is
  encoded in the indicator and what is still open.

The killzone times in `clock.html` came from that knowledge base rather than from either book
directly, because the two books disagree on two of them and `conflicts.md` records which reading
won and why.
