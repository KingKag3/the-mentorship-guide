# tools

Two Python scripts. Neither is part of the site, neither is a build step, and
nothing on the site imports anything they produce — `CLAUDE.md` means what it says about no
bundler. They exist because `analytics.js` does arithmetic that a person cannot check by reading it.

## check-analytics.py

Generates `_analytics-check.html`, a page that runs every function in `analytics.js` against values
worked out independently in Python, and prints pass or fail per check.

```
python tools/check-analytics.py
```

Then open `_analytics-check.html` in a browser. It is gitignored — regenerate rather than commit it.

**Why it is worth having.** There is no JavaScript runtime on the machines this is written on, so the
maths in `analytics.js` could otherwise only be verified by reading it and hoping. Win rate is easy
to eyeball. A Wilson score interval, a t-statistic and a 3,000-run bootstrap are not, and all three
are the sort of thing that produces a plausible number when it is wrong.

**The expectations come from a different route.** A test that reimplements its subject proves the
typing was consistent and nothing else. These are computed from the CSV in Python, in a different
language, using `statistics.stdev` and `statistics.median` rather than a transcription of the
JavaScript.

**The bootstrap is seeded on both sides**, with MINSTD rather than the obvious glibc constants —
`1103515245 * 2^31` is about `2.4e18`, past `2^53`, so JavaScript silently rounds and the two
languages disagree for reasons that have nothing to do with the code under test. That cost an
afternoon once; `48271` stays exact in a double.

## make-mock-trades.py

Generates three months of NQ round turns in Tradovate's Performance CSV shape, for testing the
importer, the calendar and the statistics page without waiting three months.

```
python tools/make-mock-trades.py
```

**The numbers are not random.** Edges are deliberately buried in it — a strong 10:00-11:00 hour, a
bad afternoon, a worse Friday, a slump in late June, and a penalty on the fourth trade of a day — so
the analytics can be checked against a known answer rather than admired. A file of coin flips would
import perfectly and tell you nothing.

`pnl` is computed from the fills rather than invented beside them, because the journal reports when a
stated figure disagrees with a derived one and tripping that with test data sends you hunting a bug
that is not there.

It found a real one on its first run: every loss was importing as a win, because the sign was read
before the currency symbol came off and `$(335.00)` does not start with a bracket.


## _rail-check.html

A page in the repo root that exercises `contents.js` — the "on this page" rail — against both shapes
it has to handle: sections written into the HTML, and sections written by JavaScript after load.
Open it in a browser; it reports pass or fail per check.

**It has never been run.** The browser pane became unavailable before it could be opened, and it is
committed in that state deliberately: an unrun test that says so is worth having, and one that
implies it passed is worse than none.

What *was* verified, by parsing every page that loads `contents.js` and counting: the deeper-h2
fallback cannot change any existing page. Six concept pages have three or more direct-child `h2`s so
the strict query still wins, `glossary.html` has one and gets no rail either way, and `stats.html`
has none in the file at all because it writes its sections at runtime — which is the case the
fallback exists for.


## check-tdz.py

Finds a `const` or `let` that is read during page setup, before the line that declares it.

```
python tools/check-tdz.py            # every page
python tools/check-tdz.py stats.html
```

**`stats.html` produced this exact failure three times in one session.** A statement that runs
immediately reaches a variable declared further down, that variable is still in its temporal dead
zone, and the page dies on load with a blank body and a console message nobody sees. A `function`
declaration would have been hoisted and worked; a `const` is not, and the difference is invisible
while reading. With no JavaScript runtime on these machines, nothing else catches it before a member
does.

**The first version of this tool was useless and said it was fine.** It looked for the variable
being mentioned at the top level on an earlier line, which never happens — in the real bug the read
is always inside a function and it is the *call* that is at the top level. It reported all eighteen
pages clean, including one broken at the time. That is why it now runs a self-test on every
invocation and refuses to report anything if the self-test fails.

**`prove-tdz-rules.py`** is the other half: eight focused cases covering the rules that keep it from
crying wolf — a dotted property is not the local variable, a name inside a callback does not run at
setup, a word inside a string is not a reference, and a two-hop call chain is still followed. It
found three phantom bugs in `calendar.html` before those rules existed, and a checker that reports
three phantom bugs gets ignored, and then the real one is ignored too.

```
python tools/prove-tdz-rules.py
```

## Never write JavaScript escapes through a shell heredoc

Not a tool — a rule, written here because breaking it took `props.html` down and cost an hour.

Editing a page with `python - <<'PYEOF'` looks safe, and the quoted delimiter is supposed to stop the
shell touching anything. It does not reliably survive this environment: `\\n` intended as a newline
escape arrived as a single `\n`, Python wrote a **real line break inside a JavaScript string
literal**, and the module stopped parsing.

The symptom is the worst one this project has:

```
SyntaxError: Invalid or unexpected token
```

with **no line number**, and a page showing its heading, its footer, and nothing between. Identical
to the blank pages that `check-tdz.py` and `check-imports.py` were each written for, and caught by
neither — both of those run *after* a parse, and nothing here ever parsed.

**Use the Write tool for any file content containing a backslash.** If a heredoc is unavoidable,
read the result back and look at the line before believing it.

### How to find one

There is no JavaScript runtime on these machines, so the check is a browser. It needs the pages over
`http://`, not `file://` — `fetch` from a `file:` or `data:` page is blocked and fails with nothing
useful to read. `.claude/launch.json` (gitignored) starts one:

```bash
python -m http.server 4173 --bind 127.0.0.1
```

Then, in the console of any page on that origin:

```js
const strip = (s) => s
  .replace(/^[ \t]*import\s+[\s\S]*?\bfrom\s*['"][^'"]*['"]\s*;?/gm, '')
  .replace(/^[ \t]*import\s*['"][^'"]*['"]\s*;?/gm, '')
  .replace(/^[ \t]*export\s*\{[^}]*\}\s*;?/gm, '')
  .replace(/^([ \t]*)export\s+default\s+/gm, '$1')
  .replace(/^([ \t]*)export\s+(?=(const|let|var|function|async|class)\b)/gm, '$1');
const check = (src) => { new Function('return (async () => {' + strip(src) + '})'); };

const html = await (await fetch('/props.html')).text();
const body = html.split('<script type="module">')[1].split('<\/script>')[0];
try { check(body); 'PARSES CLEANLY'; } catch (e) { e.message; }
```

Three details are load-bearing, each learnt by getting it wrong:

- **The import stripper is anchored to the start of a line.** Unanchored, it matched the word
  `import` inside a string on `import.html` and ate everything up to the next quoted `from`, which
  reported a syntax error in a healthy page.
- **`export` is removed as a keyword, not as a line.** Deleting whole `export` lines takes function
  signatures with them and leaves `app.js` full of orphaned braces.
- **The body is wrapped in an async arrow**, because `new Function` rejects top-level `await` and
  every one of these pages has one. Deleting the `await`s instead changes the code being checked.

A crude quote-counting scanner was tried before any of this and abandoned: thirty-five hits on three
healthy pages, nearly all apostrophes inside comments, which is the ignorable-checker failure
`prove-tdz-rules.py` exists to prevent.

**Loading each page over `http://` is the stronger check** and costs nothing once the server is up.
An unauthenticated page should reach `requireRole` and stop there — console shows `Error: not signed
in` and nothing else. Anything earlier in the console is a real fault.

## check-imports.py

Every name a page imports must be exported by the module it names.

Written after `stats.html` went blank on 11 August. Three helpers were added to
the wrong one of two adjacent import statements — they lived in `app.js` and were
asked of `analytics.js`. That is valid JavaScript, so `node --check` passes; the
link fails in the browser and the whole module never runs.

The symptom is the worst one this project has: heading, footer, nothing between.
Indistinguishable from a broken build, a slow network, or the blank members page
that cost a session in August. `app.js` carries a deadline and a placeholder for
that reason, and neither helps here, because nothing executes at all.

Companion to `check-tdz.py`, which catches the other cause of the same symptom.

```
python tools/check-imports.py
```
