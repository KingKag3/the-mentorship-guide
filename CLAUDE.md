# Working on this repo

Read this before touching anything. It is loaded automatically at the start of every session, on
every machine, which is the only reason it is worth writing things down here rather than relying on
memory that does not travel.

## What this is

A static site teaching Smart Money / ICT trading concepts in plain English, with a members area
behind Supabase auth. Public repo — it publishes itself to
<https://kingkag3.github.io/the-mentorship-guide/>.

**The TradingView indicators are not here.** They live in the private `the-mentorship-pine` repo,
along with `knowledge/`, a distilled rule base of the ICT concepts with stable rule IDs. If a
question is "what does this trading term mean" or "what are the killzone times", that repo answers
it — and it records where the source books disagree, which matters more than it sounds.

## Read these, in this order

1. `README.md` — conventions. Non-negotiable ones are below, but read the whole Conventions section
   before adding a page.
2. `ROADMAP.md` — what is worth building, in order, and what is deliberately *not* being built.
   Check here before proposing a feature; the answer may already be "no, and here is why".
3. `HANDOVER.md` — current state, what was assumed, and what has never actually been run.
4. `DECISIONS.md` — why things are the way they are. Append to it; do not rewrite it.

## Hard rules

- **No build step, no bundler, no framework.** Plain static HTML. Supabase's client loads from a CDN
  as an ES module. There is no `node_modules` and there will not be one.
- **One shared `style.css`.** Never hardcode a colour, size or spacing value — use the `:root`
  tokens. `design.html` renders every token and component and doubles as the visual regression
  check; update it when you add a component.
- **Security is Postgres row-level security, never JavaScript.** Anything in the browser controls
  what the UI *shows*, not what a user can *reach*. New tables need RLS policies in the style of
  `supabase/schema.sql`: idempotent, commented, safe to re-run.
- **No live market data.** Real-time CME data is licensed and mostly not redistributable. Every tool
  either needs no price data or takes numbers the member pastes in.
- **Record and analyse, never signal.** A calculator that sizes a position the member already chose
  is a utility. Anything that says "long NQ here" is a different product with a different liability.
- **Concept pages stay public.** They are files in a public repo; a gate on them would be
  decorative. Anything genuinely private belongs in the database, behind RLS.

## Layout

Reading pages use `.wrap`. The members index, lessons, admin and the tools use `.wrap--wide` plus
`.masthead--wide`.

## Before you say something works

Say what you actually verified. `HANDOVER.md` has an **Untested** section for a reason — at the time
of writing, nothing touching Supabase had ever been run against a live project. Do not describe
untested code as working.

## Git

Commit when asked. Push to `main` — the site publishes from it. Commit messages explain *why*, not
what; the diff already says what. End them with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
