# Smart Money, Plain English

A small static site that explains ICT / Smart Money trading vocabulary in ordinary language.

**Live:** https://kingkag3.github.io/ict-mentorship-guide/

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

## Conventions

- Plain static HTML. No build step, no bundler, no JS framework.
- One shared `style.css` rather than duplicating styles across seven files.
- The only JavaScript on the site is the ~20-line glossary filter, inline at the bottom of
  `glossary.html`.
- Diagrams are hand-written inline SVG so they inherit the palette and need no assets.
- Fonts load from Google Fonts with system fallbacks; the site is fully readable without them.

## Editing

Open any `.html` file and edit it. To preview, open the file directly in a browser — there is
nothing to compile or serve. Colours live in the `:root` block at the top of `style.css`.

To add a glossary term, copy an existing `<li>` in `glossary.html` and fill in the three spans
(`term`, `expand`, `def`). The search index is built from the list at page load, so nothing else
needs updating.

## Credit and scope

The concepts described originate with Michael J. Huddleston (Inner Circle Trader). "Smart Money
Concepts" and "ICT concepts" refer to the same body of material. All wording, diagrams and
examples on this site were written from scratch; no text from any book or course is reproduced.

Educational content only. Not financial advice. Trading involves substantial risk of loss.
