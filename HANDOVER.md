# Handover

State of the members-area build. Written for whoever picks this up next, including a fresh session
with no memory of how any of it got here.

Last updated: 5 August 2026.

---

## Built and pushed

| Page | Gated | Needs Supabase | Verified |
| --- | --- | --- | --- |
| `sizer.html` | no | no | yes — in a browser |
| `journal.html` | member | yes | no |
| `stats.html` | member | yes | no |
| `clock.html` | no | no | yes — in a browser |
| `smt.html` | no | no | yes — in a browser |

`supabase/trades.sql` creates the `trades` table, its row-level security, and two storage policies.
**It has not been run against a live project.** Nothing in the journal or statistics works until
somebody pastes it into the Supabase SQL editor.

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

- **Everything touching Supabase.** `journal.html` and `stats.html` have never run against a
  configured project. The insert path, the RLS policies, the storage policy for
  `journal/<user id>/`, and the screenshot upload are all unexercised.
- **`supabase/trades.sql` has never been executed.** It is written to be idempotent and follows the
  style of `schema.sql`, but a syntax error would not be visible until it is run.
- **The storage policies assume `storage.foldername()` behaves as documented** — that
  `(storage.foldername(name))[1]` is the first path segment. Worth confirming on first run.
- **Mobile layout.** `.tool-grid` and `.field-pair` have media queries but have not been looked at
  on a narrow viewport.
- **`design.html` has not been updated** with the new components, so it is currently an incomplete
  regression check.

---

## Known gaps

- **No pre-trade checklist yet.** `trades.checklist_done` exists and `stats.html` already slices by
  it, but nothing sets it except a bare checkbox. ROADMAP 2.2 closes this.
- **`models.html` does not link to "your results with this model."** The roadmap calls for it and
  `stats.html` now has the data to serve it.
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

**First thing to do, before any new feature:** paste `supabase/trades.sql` into the Supabase SQL
editor and log one trade through `journal.html`. Nothing in the journal or statistics has ever run
against a live project, so the whole of Phase 1 is unverified until that happens. Everything on the
Untested list above depends on it.

Then, in order: `design.html` needs the new components, the pre-trade checklist (ROADMAP 2.2) closes
a loop that is already half built, and `models.html` should link to "your results with this model"
now that `stats.html` has the data.

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
