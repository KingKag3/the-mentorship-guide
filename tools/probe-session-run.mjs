/* The chart must never draw one day's candles under another day's heading.
 *
 * `sessionRun` is handed every bar within a day either side of the trades being
 * drawn, and picks the contiguous run - the session - that the trades belong
 * to. Bars exist only for sessions, so a run IS a session, which is how the
 * page avoids keeping its own copy of the CME's timezone rules.
 *
 * WHAT THIS EXISTS TO PREVENT. It used to fall back to the LONGEST run when no
 * run contained the moment asked about. On 22 September 2026 the nightly fetch
 * had not yet collected that day - it runs at 04:30 UTC and only fetches
 * sessions that already have trades, so a session traded at 09:30 is collected
 * that night - and the query found the tail of the 21st a day earlier and drew
 * it. Tuesday's heading, Monday's prices, and the only hint on screen was a
 * caption saying none of the day's decisions were in view.
 *
 * No candles is a fine answer. The wrong candles is not.
 *
 *     node tools/probe-session-run.mjs
 */
import fs from 'node:fs';

const src = fs.readFileSync('chart.js', 'utf8');

const grab = (signature) => {
  const at = src.indexOf(signature);
  if (at < 0) throw new Error('not found in chart.js: ' + signature);
  let depth = 0, started = false;
  for (let i = at; i < src.length; i++) {
    if (src[i] === '{') { depth++; started = true; }
    else if (src[i] === '}') { depth--; if (started && !depth) return src.slice(at, i + 1); }
  }
  throw new Error('unbalanced: ' + signature);
};

const body = [
  src.match(/const SESSION_GAP_MS = [^;]+;/)[0],
  grab('export function sessionRun(').replace('export ', '')
].join('\n');

const { sessionRun } = new Function(body + '; return { sessionRun };')();

let bad = 0;
const check = (what, ok, detail) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + what + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
  if (!ok) bad++;
};

/** Five-minute bars from `from` for `count` bars. */
const session = (fromIso, count) => {
  const start = Date.parse(fromIso);
  return Array.from({ length: count },
    (_, i) => ({ ts: new Date(start + i * 5 * 60000).toISOString() }));
};

/* Two sessions with the maintenance break between them: the 21st ending 21:00Z,
 * the 22nd starting 22:00Z. */
const monday = session('2026-09-21T13:30:00Z', 90);     // to 20:55Z
const tuesday = session('2026-09-21T22:00:00Z', 200);   // the 22nd's session
const both = [...monday, ...tuesday];

check('a trade inside a session gets that session',
  sessionRun(both, '2026-09-22T13:30:52Z').length === 200,
  sessionRun(both, '2026-09-22T13:30:52Z').length);

check('a trade in the earlier session gets the earlier one',
  sessionRun(both, '2026-09-21T14:00:00Z').length === 90);

/* The real case, exactly as it happened: today's trades, and only yesterday's
 * bars in the table because today has not been fetched yet. */
check('no bars for the day means NO candles, not yesterday’s',
  sessionRun(monday, '2026-09-22T13:30:52Z').length === 0,
  sessionRun(monday, '2026-09-22T13:30:52Z').length);

check('and the same when the only bars are LATER than the trade',
  sessionRun(tuesday, '2026-09-20T15:00:00Z').length === 0);

check('nothing at all is nothing', sessionRun([], '2026-09-22T13:30:52Z').length === 0);

/* A trade minutes after the last bar of its own session still belongs to it:
 * the session is over, the fill is the closing one, and half an hour of grace
 * is the same boundary that separates the runs. */
check('a trade just after the last bar still belongs to that session',
  sessionRun(monday, '2026-09-21T21:10:00Z').length === 90);

check('but an hour after is not, and gets nothing',
  sessionRun(monday, '2026-09-21T22:10:00Z').length === 0);

/* A partly fetched session - the case the fetch now records as `pending` -
 * covers the trades it does cover, and is not stretched to ones it does not. */
const partial = session('2026-09-21T22:00:00Z', 40);     // the 22nd, up to 01:15Z
check('a partial session covers a trade inside it',
  sessionRun(partial, '2026-09-21T23:00:00Z').length === 40);
check('a partial session does not claim a trade hours past its end',
  sessionRun(partial, '2026-09-22T13:30:00Z').length === 0);

console.log(bad ? '\n' + bad + ' failed' : '\nall passed');
process.exit(bad ? 1 : 0);
