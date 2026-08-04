# Smart Money, Plain English

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
| `style.css` | Shared stylesheet (dark terminal palette, JetBrains Mono headers, Source Serif body) |

## Accounts (optional)

| File | Purpose |
| --- | --- |
| `login.html` | Sign in, create account, password reset |
| `members.html` | Members-only area; content loads from the database, not from this repo |
| `admin.html` | Approve accounts, set roles, publish members-only entries |
| `app.js` | Shared auth helpers |
| `supabase-config.js` | Project URL and anon key — both public by design |
| `supabase/schema.sql` | Tables, roles and row-level security policies |
| `supabase/invites.sql` | Invite codes: table, audit log, and the `redeem_invite` function |

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

## Conventions

- Plain static HTML. No build step, no bundler, no JS framework.
- One shared `style.css` rather than duplicating styles across seven files.
- The concept pages carry almost no JavaScript: the glossary filter, and a one-line call to render
  the account strip in the header. Auth code is confined to `app.js`, `login.html`, `members.html`
  and `admin.html`.
- Supabase's client library loads from a CDN as an ES module. No package manager, no `node_modules`.
- Diagrams are hand-written inline SVG so they inherit the palette and need no assets.
- Fonts load from Google Fonts with system fallbacks; the site is fully readable without them.

## Editing

Open any `.html` file and edit it. To preview, open the file directly in a browser — there is
nothing to compile or serve. Colours live in the `:root` block at the top of `style.css`.

To add a glossary term, copy an existing `<li>` in `glossary.html` and fill in the three spans
(`term`, `expand`, `def`). The search index is built from the list at page load, so nothing else
needs updating.

## Credit and scope

The concepts described originate with Michael J. Huddleston, and are usually labelled Smart Money
Concepts or SMC. All wording, diagrams and examples on this site were written from scratch; no
text from any book or course is reproduced.

Educational content only. Not financial advice. Trading involves substantial risk of loss.
