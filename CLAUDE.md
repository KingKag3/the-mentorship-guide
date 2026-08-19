# Working on this repo

Read this before touching anything. It is loaded automatically at the start of every session, on
every machine, which is the only reason it is worth writing things down here rather than relying on
memory that does not travel.

## What this is

A static site teaching Smart Money trading concepts in plain English, with a members area
behind Supabase auth. Public repo — it publishes itself to
<https://kingkag3.github.io/the-mentorship-guide/>.

**The TradingView indicators are not here.** They live in the private `the-mentorship-pine` repo,
along with `knowledge/`, a distilled rule base of the Smart Money concepts with stable rule IDs. If a
question is "what does this trading term mean" or "what are the killzone times", that repo answers
it — and it records where the source books disagree, which matters more than it sounds.

## Read these, in this order

1. `README.md` — conventions. Non-negotiable ones are below, but read the whole Conventions section
   before adding a page.
2. `ROADMAP.md` — what is worth building, in order, and what is deliberately *not* being built.
   Check here before proposing a feature; the answer may already be "no, and here is why".
3. `HANDOVER.md` — current state, what was assumed, and what has never actually been run.
4. `DECISIONS.md` — why things are the way they are. Append to it; do not rewrite it.

## Two machines, one repo each at a time

Work happens on two PCs against the same two repos. The files that get edited from both sides and
then disagree are always the same ones — `knowledge/implementation.md` above all, because every
piece of work wants to update it.

So the split is by **repo, not by feature**:

| Machine | Repo | Current piece |
| --- | --- | --- |
| `NERV-NEKO` | free to pick either up | Idle since 13 Aug. **Pull both before starting** — the guide moved a long way on 17–18 Aug |
| `DESKTOP-6S0E97B` | idle since the handover | Handed over 18 Aug 2026, 17:20 with everything pushed and all three checkouts level |

**Rows name machines, they do not say "this one".** They used to, and it was wrong in the only
situation the table exists for: this file loads automatically on both PCs, so a row reading *"This
one — both repos, the review loop"* tells whichever machine is reading that **it** holds the work.
On the machine that has just been walked away from, that is exactly backwards, and it is believed,
because the file is the thing you are supposed to trust. Check the hostname against the table before
reading anything else in it.

**The split is suspended, not abandoned.** An overnight session was asked for indicator work while
the site work was still open, so one machine currently holds both. That is fine while only one
machine is running. Put the split back the moment two are.

**Starting on the other PC: pull both repos first.** `the-mentorship-guide` moved a long way on
12–13 August — the review loop, `editor.js`, reply threads, `member-last-seen`, and four checkers in
`tools/`. A stale checkout will not conflict, it will quietly rebuild something that already exists.

**A second session on the same machine is not a second machine, and is not covered by the table
above.** Two sessions ran against this repo on 12 August — one on the journal, one on the storage
policy and the reply table — and it worked only because they were told to stay in different files.
The rule that makes it safe is the same one: agree the files first, and push between them. Two
sessions editing `journal.html` from the same checkout is a lost edit, not a merge conflict, because
neither one is a separate branch.

There is also a running list of migrations waiting to be applied in
[supabase/RUN-THESE.md](supabase/RUN-THESE.md). Add to it rather than burying a new one in a commit
message.

Both repos exist on both machines and both still need pulling. The rule is only about where **edits**
originate. If a piece genuinely needs both — a new indicator that also needs a page — do the repos in
sequence and push between them, never in parallel from two machines.

Change the table when the pieces change. A stale row here is worse than no row, because it will be
believed.

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

## Always link what you changed

End any turn that touched a file with links to it, so Kag3 can open, review and copy without going
looking. This lives here rather than in a memory file because he works from two machines and
`DECISIONS.md` (2026-08-05) records that anything written only to memory is invisible on the other
one.

- **Files** — a markdown link on the repo-relative path, which the app makes clickable:
  `[import.html](import.html)`, `[knowledge/setups.md](knowledge/setups.md)`.
- **Commits** — the GitHub URL, never a bare hash. Public repo:
  `https://github.com/KingKag3/the-mentorship-guide/commit/<sha>`. Private pine repo is the same
  shape under `the-mentorship-pine` and works while he is signed in.
- **Raw URLs work for this repo and not for the pine one.** `raw.githubusercontent.com` does not
  read a browser session, so a raw link to anything in the **private** `the-mentorship-pine` repo
  returns 404 no matter who is signed in. For public files a raw link is the best thing to give,
  because it copies cleanly. For private ones give the `blob` URL and use the file-send tool to
  attach the file itself — the "Copy raw file" button on the blob page is the working equivalent.
- **Pine scripts he has to paste into TradingView** — attach the file, and repeat the
  paste-over-the-whole-buffer warning. Pasting *into* the editor leaves the old declaration and
  produces "your script has 2".

## Git

Commit when asked. Push to `main` — the site publishes from it. Commit messages explain *why*, not
what; the diff already says what. End them with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
