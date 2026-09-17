/* The session window and the bar parsing, out of the Edge Function itself.
 *
 * The function is Deno and cannot be run here, but the two parts most likely to
 * be quietly wrong are plain JavaScript with no Deno in them, so they are cut
 * out of the source by brace-matching and run under node. A change to the
 * function is a change to what this tests.
 *
 * WHY THE WINDOW IS THE FRIGHTENING PART. A CME session is not a calendar day:
 * it runs 18:00 New York the evening before to 17:00 on its own day. New York
 * is UTC-5 in winter and UTC-4 in summer, so a fixed offset is right for half
 * the year and an hour out for the other half - and an hour out does not throw.
 * It draws every fill one candle away from where it happened, twice a year, on
 * days nobody thinks to check.
 *
 * The first version of sessionWindow took the close and subtracted 23 hours.
 * That is right for 363 days and wrong on the two the rest of this file is
 * about: across a DST change a session is 22 or 24 real hours long. This probe
 * is what found it.
 *
 *     node tools/probe-session-window.mjs
 */
import fs from 'node:fs';

const SRC = 'supabase/functions/fetch-bars/index.ts';
const raw = fs.readFileSync(SRC, 'utf8');

/* TYPES COME OFF BEFORE ANY BRACE IS COUNTED, and that order is the whole
 * trick. `sessionWindow` declares its return as `{ from: Date; to: Date }`, so
 * a brace-matcher run over the original source takes the first brace of the
 * TYPE for the start of the body and stops at its close - handing back a
 * function whose body is the type annotation. */
const strip = (code) => code
  // A return annotation that is an object type: braces of its own, then the
  // real body's brace. Must go before the general rule, which cannot cross a
  // brace and would leave this one behind.
  .replace(/\)\s*:\s*\{[^{}]*\}\s*\{/g, ') {')
  // Any other return annotation: ")", a colon, anything up to the body brace.
  .replace(/\)\s*:\s*[^{;]+?\s*\{/g, ') {')
  /* A parameter annotation: "(name: Type" or ", name: Type" - but ONLY for
   * type names that are actually types.
   *
   * The general version of this rule ate `to: newYorkToUtc(...)` out of the
   * object `sessionWindow` returns, because a key in an object literal after a
   * comma looks exactly like an annotated parameter. The result still parsed
   * and returned a broken window, which is the worst way for a test helper to
   * be wrong. An allowlist cannot make that mistake. */
  .replace(/([(,]\s*[A-Za-z_$][\w$]*)\s*:\s*(Date|string|number|boolean|unknown|any|void|Bar)\b/g,
           '$1')
  // The non-null assertion. TypeScript's "!" after an expression is a claim
  // about a type, not an operator, and node reads it as a syntax error.
  .replace(/!\./g, '.');

const src = strip(raw);

const grab = (signature) => {
  const at = src.indexOf(signature);
  if (at < 0) throw new Error('not found in ' + SRC + ': ' + signature);
  let depth = 0, started = false;
  for (let i = at; i < src.length; i++) {
    if (src[i] === '{') { depth++; started = true; }
    else if (src[i] === '}') { depth--; if (started && !depth) return src.slice(at, i + 1); }
  }
  throw new Error('unbalanced: ' + signature);
};

// TypeScript annotations stripped: these three functions use no types beyond
// parameter and return annotations, so removing them leaves the real code.
/* The timezone constant comes out of the source too, rather than being written
 * again here. If somebody changes the exchange this code is about, that must
 * reach the test - a probe carrying its own copy of the answer is a probe that
 * keeps passing after the thing it tests has moved. */
const tzLine = raw.match(/const EXCHANGE_TZ = '[^']+';/);
if (!tzLine) throw new Error('EXCHANGE_TZ not found in ' + SRC);

const body = [tzLine[0], ...['function offsetMs(', 'function newYorkToUtc(', 'function sessionWindow(']
  .map(grab)].join('\n\n');

const { sessionWindow, newYorkToUtc } =
  new Function(body + '; return { sessionWindow, newYorkToUtc };')();

let bad = 0;
const check = (what, ok, detail) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + what + (detail !== undefined ? '  ' + detail : ''));
  if (!ok) bad++;
};

const win = (day) => {
  const w = sessionWindow(day);
  return [w.from.toISOString(), w.to.toISOString(),
          (w.to - w.from) / 3600000];
};

/* A summer session, checked against a real answer from the source: asking for
 * 2026-09-15T22:00Z to 2026-09-16T21:00Z returned 277 five-minute bars whose
 * first and last sit exactly on those instants. */
{
  const [from, to, hours] = win('2026-09-16');
  check('EDT session opens 18:00 New York the evening before',
        from === '2026-09-15T22:00:00.000Z', from);
  check('EDT session closes 17:00 New York', to === '2026-09-16T21:00:00.000Z', to);
  check('EDT session is 23 hours', hours === 23, hours);
}

// A winter session. Same wall clock, an hour later in UTC, both ends.
{
  const [from, to, hours] = win('2026-01-15');
  check('EST session opens at 23:00Z', from === '2026-01-14T23:00:00.000Z', from);
  check('EST session closes at 22:00Z', to === '2026-01-15T22:00:00.000Z', to);
  check('EST session is 23 hours', hours === 23, hours);
}

/* The clocks go forward on Sunday 8 March 2026 and back on Sunday 1 November.
 * The sessions either side of them are ordinary; the sessions that CONTAIN the
 * change are 22 and 24 real hours, and are what the subtract-23-hours version
 * got wrong. */
{
  const [from, to, hours] = win('2026-03-09');
  check('the session after the spring change is normal',
        from === '2026-03-08T22:00:00.000Z' && to === '2026-03-09T21:00:00.000Z' && hours === 23,
        from + ' -> ' + to + ' (' + hours + 'h)');
}
{
  const [from, to, hours] = win('2026-03-08');
  check('the session containing the spring change is 22 hours',
        from === '2026-03-07T23:00:00.000Z' && to === '2026-03-08T21:00:00.000Z' && hours === 22,
        from + ' -> ' + to + ' (' + hours + 'h)');
}
{
  const [from, to, hours] = win('2026-11-02');
  check('the session after the autumn change is normal',
        from === '2026-11-01T23:00:00.000Z' && to === '2026-11-02T22:00:00.000Z' && hours === 23,
        from + ' -> ' + to + ' (' + hours + 'h)');
}
{
  const [from, to, hours] = win('2026-11-01');
  check('the session containing the autumn change is 24 hours',
        from === '2026-10-31T22:00:00.000Z' && to === '2026-11-01T22:00:00.000Z' && hours === 24,
        from + ' -> ' + to + ' (' + hours + 'h)');
}

// Month and year boundaries: the evening before the 1st is the previous month.
{
  const [from] = win('2026-03-01');
  check('the 1st reaches back into February', from === '2026-02-28T23:00:00.000Z', from);
}
{
  const [from] = win('2026-01-01');
  check('New Year reaches back into the previous year',
        from === '2025-12-31T23:00:00.000Z', from);
}

// The half-hour zones are not New York, but the helper must not be accidentally
// right only for whole-hour offsets.
check('an instant inside the spring gap resolves',
      newYorkToUtc(2026, 3, 8, 3).toISOString() === '2026-03-08T07:00:00.000Z',
      newYorkToUtc(2026, 3, 8, 3).toISOString());

console.log(bad ? '\n' + bad + ' failed' : '\nall passed');
process.exit(bad ? 1 : 0);
