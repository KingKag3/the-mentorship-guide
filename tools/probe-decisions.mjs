/* One trade in eighteen copied accounts is ONE decision.
 *
 * Money stays pooled - eighteen accounts really did make eighteen lots of it -
 * but anything that counts, sequences or weighs evidence has to collapse the
 * copies, or every panel on the site claims eighteen times the evidence it has.
 *
 * WHAT THIS PROBE EXISTS TO PIN DOWN. The rule keyed on the exact `opened_at`
 * string, and a copier does not fill every account in the same second. Real
 * data, 17 September 2026: nineteen rows identical in symbol, direction, size,
 * entry and exit - five stamped 13:31:20, fourteen stamped 13:31:21. One trade,
 * counted as two everywhere. The fixture below is those rows.
 *
 * The timestamp is bucketed to the minute now, so the cases that matter are
 * the ones either side of that: jitter inside a minute collapses, genuinely
 * different trades still do not, and a straddle of a minute boundary still
 * splits - which is recorded here as a known limit rather than left to be
 * discovered as a surprise.
 *
 *     node tools/probe-decisions.mjs
 */
import fs from 'node:fs';

const src = fs.readFileSync('app.js', 'utf8');

const grab = (signature) => {
  const at = src.indexOf(signature);
  if (at < 0) throw new Error('not found in app.js: ' + signature);
  let depth = 0, started = false;
  for (let i = at; i < src.length; i++) {
    if (src[i] === '{') { depth++; started = true; }
    else if (src[i] === '}') { depth--; if (started && !depth) return src.slice(at, i + 1); }
  }
  throw new Error('unbalanced: ' + signature);
};

const consts = [
  src.match(/const DECISION_WINDOW_MS = [^;]+;/)[0],
  src.match(/const sameNumber = [\s\S]*?\n};/)[0]
].join('\n');

const body = [consts,
              grab('export function decisionKey('),
              grab('export function distinctDecisions(')]
  .join('\n\n').replace(/export /g, '');

const { decisionKey, distinctDecisions } =
  new Function(body + '; return { decisionKey, distinctDecisions };')();

let bad = 0;
const check = (what, ok, detail) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + what + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
  if (!ok) bad++;
};

/* The real thing, shortened: the same fill in nineteen accounts, its timestamp
 * landing either side of a second boundary. */
const copies = [];
for (let i = 0; i < 19; i++) {
  copies.push({
    account: 'APEX-26922-' + (1672 + i),
    opened_at: i < 5 ? '2026-09-17T13:31:20+00:00' : '2026-09-17T13:31:21+00:00',
    symbol: 'NQ', direction: 'short', contracts: '1',
    entry: '29704.25', exit_price: '29659', net_pnl: '901.9'
  });
}

check('nineteen copies are one decision', distinctDecisions(copies).length === 1,
      distinctDecisions(copies).length);
check('and they share a key', new Set(copies.map(decisionKey)).size === 1);

/* Anything that genuinely differs still separates. These are the guards against
 * the fix going too far the other way and hiding real trades. */
const base = { opened_at: '2026-09-17T13:31:20+00:00', symbol: 'NQ', direction: 'short',
               contracts: '1', entry: '29704.25', exit_price: '29659' };
const variant = (change) => distinctDecisions([base, { ...base, ...change }]).length;

check('a different direction is a different decision', variant({ direction: 'long' }) === 2);
check('a different size is a different decision', variant({ contracts: '2' }) === 2);
check('a different entry is a different decision', variant({ entry: '29705' }) === 2);
check('a different exit is a different decision', variant({ exit_price: '29660' }) === 2);
check('a different symbol is a different decision', variant({ symbol: 'ES' }) === 2);
check('a different minute is a different decision',
      variant({ opened_at: '2026-09-17T13:32:20+00:00' }) === 2);
check('an hour later is a different decision',
      variant({ opened_at: '2026-09-17T14:31:20+00:00' }) === 2);

/* A price is the same price whether it arrives as a string or a number. Two
 * paths into this table return numerics differently, and joining them raw made
 * one fill into two. */
check('"29704.25" and 29704.25 are the same fill',
      distinctDecisions([base, { ...base, entry: 29704.25, contracts: 1, exit_price: 29659 }]).length === 1);

/* The known limit, asserted so it is a decision rather than a surprise: a
 * copier straddling a MINUTE boundary still splits. One minute in sixty, and it
 * fails the way the old code failed rather than in a new way. */
check('a minute-boundary straddle still splits, as documented',
      distinctDecisions([
        { ...base, opened_at: '2026-09-17T13:31:59+00:00' },
        { ...base, opened_at: '2026-09-17T13:32:00+00:00' }
      ]).length === 2);

check('an unparseable timestamp does not merge everything',
      distinctDecisions([
        { ...base, opened_at: 'not a date' },
        { ...base, opened_at: 'also not a date' }
      ]).length === 2);

check('the kept row is a real row, not a synthesised one',
      copies.includes(distinctDecisions(copies)[0]));

check('an empty list is empty', distinctDecisions([]).length === 0);

console.log(bad ? '\n' + bad + ' failed' : '\nall passed');
process.exit(bad ? 1 : 0);
