/* A NINJATRADER GRID EXPORT, READ BY THE IMPORTER'S OWN RULES.
 *
 * The fixture is the header of a real file - `NinjaTrader Grid 2026-09-30
 * 11-33 AM.csv`, nine MNQ trades on a live margin account - and it is here
 * because three separate things about it were wrong when it arrived, and two
 * of them were wrong silently:
 *
 *   1. `Market pos.` normalises to `marketpos`, which matched no synonym and
 *      no loose rule either. Side is a REQUIRED field, so an otherwise
 *      ordinary file stopped the import dead.
 *
 *   2. The cost of a round turn is split five ways - commission, clearing,
 *      exchange, IP, NFA. Taking the first understates it by more than half
 *      ($0.70 of $1.80). And because `Profit` in this export is already NET of
 *      all five, the site would compare the reported figure against one
 *      derived from the prices less the fees it knew about, find a gap on
 *      EVERY row, and report every trade as disagreeing with itself.
 *
 *   3. `Instrument` is `MNQ DEC26`, and `contractFor` looked for an exact key.
 *      No spec means no points, no ticks and no derived dollars - absent
 *      rather than wrong, which is harder to notice.
 *
 * `Cum. net profit` is the trap in the other direction: a running total that
 * must NOT be taken as the row's own figure. It is left unmapped because the
 * exact pass gives `Profit` to net_pnl first.
 *
 *     node tools/probe-ninjatrader.mjs
 */
import fs from 'node:fs';

const imp = fs.readFileSync('import.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

const grab = (text, signature) => {
  const at = text.indexOf(signature);
  if (at < 0) throw new Error('not found: ' + signature);

  let from = at, paren = 0;
  for (let i = at; i < text.length; i++) {
    if (text[i] === '(') paren++;
    else if (text[i] === ')') { paren--; if (!paren) { from = text.indexOf('{', i); break; } }
  }

  let depth = 0, started = false;
  for (let i = from; i < text.length; i++) {
    if (text[i] === '{') { depth++; started = true; }
    else if (text[i] === '}') { depth--; if (started && !depth) return text.slice(at, i + 1); }
  }
  throw new Error('unbalanced: ' + signature);
};

// The real header, with the trailing comma the file actually carries.
const HEADERS = ['Trade number', 'Instrument', 'Account', 'Strategy', 'Market pos.', 'Qty',
  'Entry price', 'Exit price', 'Entry time', 'Exit time', 'Entry name', 'Exit name', 'Profit',
  'Cum. net profit', 'Commission', 'Clearing Fee', 'Exchange Fee', 'IP Fee', 'NFA Fee',
  'MAE', 'MFE', 'ETD', 'Bars', ''];

const ROWS = [
  ['1', 'MNQ DEC26', '2234697', '', 'Long', '1', '30842.75', '30845.50',
   '9/30/2026 11:16:00 AM', '9/30/2026 11:16:21 AM', '', '', '$3.70', '$3.70',
   '$0.70', '$0.38', '$0.70', '$0.00', '$0.02', '$5.50', '$5.50', '$1.80', '0', ''],
  ['2', 'MNQ DEC26', '2234697', '', 'Long', '1', '30853.25', '30843.25',
   '9/30/2026 11:16:31 AM', '9/30/2026 11:17:33 AM', '', '', '($21.80)', '($18.10)',
   '$0.70', '$0.38', '$0.70', '$0.00', '$0.02', '$20.00', '$20.00', '$41.80', '0', ''],
  ['3', 'MNQ DEC26', '2234697', '', 'Short', '1', '30838.25', '30837.00',
   '9/30/2026 11:18:25 AM', '9/30/2026 11:18:46 AM', '', '', '$0.70', '($17.40)',
   '$0.70', '$0.38', '$0.70', '$0.00', '$0.02', '$2.50', '$2.50', '$1.80', '0', '']
];

/* The mapper and the readers, lifted out of the page. `headers`, `rows` and
 * `headerAt` are the page's own module state; they are handed in rather than
 * rebuilt so this tests what ships. */
const build = (headers, rows) => new Function(
  'headers', 'rows', 'headerAt',
  imp.match(/const FIELDS = \[[\s\S]*?\n\];/)[0] + '\n' +
  imp.match(/const PAIRED = \[[\s\S]*?\n\];/)[0] + '\n' +
  imp.match(/const ALL_FIELDS = [^;]+;/)[0] + '\n' +
  imp.match(/const norm = [^;]+;/)[0] + '\n' +
  grab(imp, 'function autoMap(') + '\n' +
  grab(imp, 'function columnsFor(') + '\n' +
  grab(imp, 'function numericValue(') + '\n' +
  'let mapping = autoMap();' +
  grab(imp, 'function raw(') + '\n' +
  grab(imp, 'function text(') + '\n' +
  grab(imp, 'function numeric(') + '\n' +
  grab(imp, 'function parseSide(') + '\n' +
  '; return { mapping, headers, raw, text, numeric, parseSide, columnsFor };')(
    headers, rows, 0);

const { mapping, columnsFor, text, numeric, parseSide } = build(HEADERS, [HEADERS, ...ROWS]);

const { contractFor } = new Function(
  app.match(/export const CONTRACTS = \{[\s\S]*?\n\};/)[0].replace('export ', '') + '\n' +
  grab(app, 'export function rootSymbol(').replace('export ', '') + '\n' +
  grab(app, 'export function contractFor(').replace('export ', '') +
  '; return { contractFor };')();

let bad = 0;
const check = (what, ok, detail) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + what + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
  if (!ok) bad++;
};

const col = (key) => HEADERS[columnsFor(key)[0]];

// --------------------------------------------------------- the columns land

check('side comes off "Market pos."', col('direction') === 'Market pos.', col('direction'));
check('and reads as a side', parseSide(text(ROWS[0], 'direction')) === 'long');
check('short reads as short', parseSide(text(ROWS[2], 'direction')) === 'short');

check('symbol is Instrument', col('symbol') === 'Instrument', col('symbol'));
check('when is Entry time', col('opened_at') === 'Entry time', col('opened_at'));
check('closed is Exit time', col('closed_at') === 'Exit time', col('closed_at'));
check('entry and exit are the prices',
      col('entry') === 'Entry price' && col('exit_price') === 'Exit price');
check('quantity is Qty', col('contracts') === 'Qty', col('contracts'));
check('the id is the trade number', col('external_id') === 'Trade number', col('external_id'));
check('the account column is found', col('account') === 'Account', col('account'));

// ------------------------------------------- the two that were silently wrong

check('net p&l is Profit, not the running total',
      col('net_pnl') === 'Profit', col('net_pnl'));
check('and the cumulative column is claimed by nothing',
      !Object.keys(mapping).some((k) => columnsFor(k).includes(HEADERS.indexOf('Cum. net profit'))),
      HEADERS.indexOf('Cum. net profit'));

{
  const cols = columnsFor('fees').map((i) => HEADERS[i]);
  check('every fee column is picked up, not just commission', cols.length === 5, cols);
  check('and they are the five this file has',
        ['Commission', 'Clearing Fee', 'Exchange Fee', 'IP Fee', 'NFA Fee']
          .every((h) => cols.includes(h)), cols);
  check('they add up rather than reporting the first',
        Math.abs(numeric(ROWS[0], 'fees') - 1.80) < 0.005, numeric(ROWS[0], 'fees'));
}

// ------------------------------------------------------ accountants' brackets

check('a bracketed loss is a loss',
      Math.abs(numeric(ROWS[1], 'net_pnl') + 21.80) < 0.005, numeric(ROWS[1], 'net_pnl'));
check('and a plain figure is not inverted',
      Math.abs(numeric(ROWS[0], 'net_pnl') - 3.70) < 0.005, numeric(ROWS[0], 'net_pnl'));

// --------------------------------------------------- the spec, and the check

{
  const spec = contractFor(text(ROWS[0], 'symbol'));
  check('an expiring contract still finds its spec', spec && spec.perPoint === 2,
        spec && spec.perPoint);

  /* THE WHOLE POINT, ON REAL NUMBERS. `Profit` is net of the five fees, so
   * gross less fees has to reproduce it - otherwise every row on this page
   * reports itself as disagreeing with itself.
   *
   *   row 1  long  30842.75 -> 30845.50 = +2.75 pts = $5.50 - $1.80 = $3.70
   *   row 2  long  30853.25 -> 30843.25 = -10.0 pts = -$20.00 - $1.80 = -$21.80
   *   row 3  short 30838.25 -> 30837.00 = +1.25 pts = $2.50 - $1.80 = $0.70
   */
  for (const [i, row] of ROWS.entries()) {
    const side = parseSide(text(row, 'direction'));
    const entry = numeric(row, 'entry');
    const exit = numeric(row, 'exit_price');
    const size = numeric(row, 'contracts');
    const points = side === 'short' ? entry - exit : exit - entry;
    const derived = points * contractFor(text(row, 'symbol')).perPoint * size
                    - numeric(row, 'fees');

    check('row ' + (i + 1) + ' derives its own reported figure',
          Math.abs(derived - numeric(row, 'net_pnl')) < 0.005,
          { derived: +derived.toFixed(2), reported: numeric(row, 'net_pnl') });
  }
}

// ------------------------------------------- one fee column behaves as before

{
  const simple = ['When', 'Symbol', 'Side', 'Qty', 'Commission', 'P/L'];
  const rows = [simple, ['2026-09-30', 'NQ', 'Long', '1', '$4.20', '$100.00']];
  const one = build(simple, rows);
  check('a file with a single fee column keeps a plain index',
        !Array.isArray(one.mapping.fees) && one.mapping.fees === 4, one.mapping.fees);
  check('and reads the same as it always did',
        Math.abs(one.numeric(rows[1], 'fees') - 4.20) < 0.005, one.numeric(rows[1], 'fees'));
}

{
  // No fee column at all is nothing, not zero.
  const none = ['When', 'Symbol', 'Side', 'Qty'];
  const one = build(none, [none, ['2026-09-30', 'NQ', 'Long', '1']]);
  check('no fee column is null rather than zero',
        one.numeric(['2026-09-30', 'NQ', 'Long', '1'], 'fees') === null);
}

{
  // Every mapped fee column blank on a row is also nothing: "no figure" and
  // "free" are different facts and the rest of the site tells them apart.
  const blanks = ROWS[0].slice();
  for (const i of columnsFor('fees')) blanks[i] = '';
  check('a row with every fee blank is null, not zero', numeric(blanks, 'fees') === null,
        numeric(blanks, 'fees'));
}

// ------------------------------------- the root, and why it is not cosmetic

/* THE SYMBOL IS STORED AS A ROOT, OR THE CANDLES NEVER ARRIVE.
 *
 * `rootSymbol` stripped a trailing month code - NQZ6 to NQ - and nothing else,
 * so `MNQ DEC26` was stored whole. The bar fetcher asks for sessions whose
 * symbol maps to NQ or ES; `MNQ DEC26` maps to neither, so a fortnight of
 * charts drew the fills with no candles behind them.
 *
 * Nothing errored and nothing was missing. The trades were right, the totals
 * were right, and a session with no bars draws exactly like a day Yahoo had
 * nothing for. That is the whole reason this is pinned: the symptom is
 * indistinguishable from a legitimate empty.
 */
// Moved to app.js on 9 October, so the importer, the contract spec and the
// chart's bar lookup all read the same rule.
const rootSymbol = new Function(
  grab(app, 'export function rootSymbol(').replace('export ', '') +
  '; return rootSymbol;')();

{
  check('a spaced expiry is stripped', rootSymbol('MNQ DEC26') === 'MNQ', rootSymbol('MNQ DEC26'));
  check('with a space before the year too', rootSymbol('MNQ DEC 26') === 'MNQ');
  check('and a dashed one', rootSymbol('NQ 12-26') === 'NQ', rootSymbol('NQ 12-26'));
  check('a month code still is', rootSymbol('MNQZ6') === 'MNQ');
  check('and a venue prefix', rootSymbol('CM.NQZ6') === 'NQ', rootSymbol('CM.NQZ6'));
  check('lower case comes back rooted and upper', rootSymbol('mnq dec26') === 'MNQ');
}

{
  // The ones that must survive untouched. A root that eats a real symbol is a
  // worse bug than the one being fixed.
  for (const sym of ['MNQ', 'NQ', 'ES', 'MES', 'MYM', 'M2K', 'RTY']) {
    check('"' + sym + '" is left alone', rootSymbol(sym) === sym, rootSymbol(sym));
  }

  check('a dotted equity is not mistaken for a venue prefix',
        rootSymbol('BRK.B') === 'BRK.B', rootSymbol('BRK.B'));
  check('and nothing at all stays nothing', rootSymbol('') === '' && rootSymbol(null) === '');
}

{
  /* The fetcher reads what was already stored, so the mapping strips the
   * expiry on the way past rather than rewriting a member's trades. */
  const sql = fs.readFileSync('supabase/bars-root-symbol.sql', 'utf8');
  check('a migration roots the symbol for the fetcher too',
        sql.includes('create or replace function public.bar_root_symbol'));
  check('and the wanted-sessions view uses it',
        sql.includes("bar_root_symbol(t.symbol) in ('MNQ', 'NQ')"));
  check('without rewriting a single trade', !/update\s+public\.trades/i.test(sql));
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
