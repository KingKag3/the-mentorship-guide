# Trade Karma

A small static site that explains Smart Money trading vocabulary in ordinary language.

**Live:** https://kingkag3.github.io/the-mentorship-guide/

## What's here

| File | Covers |
| --- | --- |
| `index.html` | Overview, how the vocabulary is organised, suggested order of study |
| `liquidity.html` | Buyside/sellside, internal vs external range, draw on liquidity, LRLR/HRLR, stop hunts, Judas swing, turtle soup, liquidity voids |
| `pd-arrays.html` | Premium/discount/equilibrium, fair value gaps, BISI/SIBI, order blocks, breakers, mitigation, rejection, propulsion, vacuum blocks, BPR/RDRB, NWOG/NDOG |
| `structure.html` | Swing points, STH/ITH/LTH hierarchy, displacement, MSS vs BOS, three drives, market phases, daily bias, SMT divergence, top-down analysis |
| `time.html` | The five killzones, daily rhythm, hours of operation, power of three, CBDR, day-of-week tendencies, news days, seasonality, IPDA look-back ranges |
| `models.html` | 2022 entry model, ATM method, market maker buy/sell curves, silver bullet, turtle soup, daily templates, risk rules, journaling |
| `glossary.html` | Searchable jargon decoder — ~95 acronyms, one plain sentence each |
| `style.css` | Shared stylesheet — tokens, light and dark themes, every component |
| `theme.js` | Theme bootstrap: applies the stored choice before first paint, wires the toggle |
| `design.html` | Live design system — tokens, type scale, spacing, every component rendered |

## Accounts (optional)

| File | Purpose |
| --- | --- |
| `login.html` | Sign in, create account, password reset |
| `members.html` | Curriculum index — phases with their numbered entries |
| `lesson.html` | A single entry, with previous/next navigation across its phase |
| `admin.html` | Approve accounts, set roles, publish members-only entries |
| `journal.html` | Trade journal — tagged against the curriculum's vocabulary, private per member |
| `scripts.html` | TradingView indicators for members, with install instructions |
| `stats.html` | Statistics over the journal, sliced by model, session, array and bias |
| `app.js` | Shared auth helpers |
| `supabase-config.js` | Project URL and anon key — both public by design |
| `supabase/schema.sql` | Tables, roles and row-level security policies |
| `supabase/invites.sql` | Invite codes: table, audit log, and the `redeem_invite` function |
| `supabase/lesson-media.sql` | Video field and attachment links on entries |
| `supabase/storage.sql` | Private `lesson-media` bucket and cover image field |
| `supabase/phases.sql` | Phases — the parts of the curriculum entries belong to |
| `supabase/trades.sql` | Trade journal: table, row-level security, per-member storage policies |
| `supabase/scripts.sql` | Pine source for members - stored in the database, never as a file here |

## Tools

Calculators that need no login, because they hold no private data and a gate on a file in a public
repo would be decorative.

| File | Covers |
| --- | --- |
| `sizer.html` | Position sizer — contracts from a stop and a risk budget, ES/NQ and the micros |
| `clock.html` | Killzone clock — which window is running, computed in `America/New_York` |
| `smt.html` | SMT checker — ES against NQ at a swing, and which index failed to confirm |

Authentication runs on Supabase (free tier). Permissions are enforced by database policies, not by
JavaScript. **See [SETUP.md](SETUP.md)** for the walkthrough — the site works fine without it.

Three roles: `pending` (new signups, no access), `member` (reads published entries), `admin`
(everything). New accounts start pending and need approval — or an invite code, which promotes the
holder to `member` automatically via a `SECURITY DEFINER` function that only ever writes `member`.
Users still have no permission to update their own profile row, so self-promotion is impossible by
any other route.

Note what this does *not* do: the seven concept pages stay public. They are plain files in a public
repo and readable by anyone with the address regardless of what the UI shows, so gating them would
be decorative. Anything genuinely private belongs in the members area, where content lives in the
database.

## Charts

The TradingView indicators live in a separate **private** repository, `the-mentorship-pine`. They
carry entry, stop and target logic, which is exactly the kind of thing that should not sit in a
repo that publishes itself to the web.

Members receive a script through `scripts.html`, which reads it from the `scripts` table behind
row-level security. The source is therefore never a file in this repository — publishing one here
would defeat the reason the indicators were moved out in the first place. The private repo stays
the source of truth; a version is pasted into the admin page to distribute it.

## Where this is going

[ROADMAP.md](ROADMAP.md) lays out the members-area tools worth building and the order to build them
in — position sizer, tagged trade journal, statistics over that journal, then the ES/NQ-specific
work. It also records what is deliberately not being built, and why.

## Conventions

- Plain static HTML. No build step, no bundler, no JS framework.
- The tool list lives once, in `TOOLS` in `app.js`. Every page that shows tools renders from it —
  the members index as cards, each tool page as a compact rail. Three pages had already drifted
  into three different hand-written link rows before this existed.
- One shared `style.css` rather than duplicating styles across seven files. Every colour is a
  token, and every token has a light and a dark value — a hardcoded hex is wrong in one theme by
  definition, including inside the inline SVG diagrams, which use `svg-f-*` / `svg-s-*` classes
  because a presentation attribute cannot hold a `var()`.
- Three type families with one job each: Source Serif for content, Inter for interface, JetBrains
  Mono for data. Green and red are reserved for market direction; the interface is blue.
- The concept pages carry almost no JavaScript: the glossary filter, and a one-line call to render
  the account strip in the header. Auth code is confined to `app.js`, `login.html`, `members.html`
  and `admin.html`.
- Supabase's client library loads from a CDN as an ES module. No package manager, no `node_modules`.
- Diagrams are hand-written inline SVG so they inherit the palette and need no assets.
- Fonts load from Google Fonts with system fallbacks; the site is fully readable without them.

## Editing

Open any `.html` file and edit it. To preview, open the file directly in a browser — there is
nothing to compile or serve.

Design tokens — colours, type scale, spacing, widths, radii — live in the `:root` block at the top
of `style.css`. Change one there and it propagates everywhere. `design.html` renders all of them
live alongside every component, so it doubles as the reference and as a visual regression check:
if a change breaks something, it usually shows up there first.

Two layout widths exist. Reading pages use `.wrap` (1040px, prose capped at 78 characters). The
members index, single lessons and the admin console use `.wrap--wide` plus `.masthead--wide`
(1240px), which keeps prose at the same measure but lets images, video and tables use the full
column.

To add a glossary term, copy an existing `<li>` in `glossary.html` and fill in the three spans
(`term`, `expand`, `def`). The search index is built from the list at page load, so nothing else
needs updating.

## Credit and scope

The concepts described originate with Michael J. Huddleston, and are usually labelled Smart Money
Concepts or SMC. All wording, diagrams and examples on this site were written from scratch; no
text from any book or course is reproduced.

Educational content only. Not financial advice. Trading involves substantial risk of loss.
