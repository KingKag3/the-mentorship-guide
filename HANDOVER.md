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

## Where the reasoning lives

- `ROADMAP.md` — what is worth building, in order, and what is deliberately excluded.
- `README.md` — conventions. Read the Conventions section before adding a page.
- The private `the-mentorship-pine` repo, `knowledge/` — distilled ICT rules with stable IDs,
  `conflicts.md` for where the source books disagree and which won, `implementation.md` for what is
  encoded in the indicator and what is still open.

The killzone times in `clock.html` came from that knowledge base rather than from either book
directly, because the two books disagree on two of them and `conflicts.md` records which reading
won and why.
