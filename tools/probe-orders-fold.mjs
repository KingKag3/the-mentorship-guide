/* A WEALTHCHARTS ORDERS EXPORT, END TO END, AND THE GATE THAT TURNED IT AWAY.
 *
 * `orders (73).csv`, 1 October 2026: 9,103 fills across twenty-five accounts,
 * folding to 4,545 round turns. Every stage of the importer handled it - the
 * fold, the automatic mapping, the row reader - and the page showed nothing.
 *
 * It never got that far. The file was refused before being read:
 *
 *     if (!$('acct').value.trim()) { ...clear the file input; return; }
 *
 * on the grounds that most exports do not name an account. True, and not a
 * reason to refuse the ones that do - this file carries twenty-five in a
 * `name` column. The file input was cleared as well, so the page went blank
 * and the only explanation was a status line above the fold.
 *
 * "I select a file and get nothing" is exactly what that looks like from
 * outside, and nothing in the code was wrong in a way any test would catch:
 * every function worked perfectly on data it was never handed.
 *
 * So this probe runs the real file through the real stages, and asserts the
 * thing that was actually broken - that a file naming its own accounts needs
 * nothing typed in a box.
 *
 *     node tools/probe-orders-fold.mjs
 */
import fs from 'node:fs';

const imp = fs.readFileSync('import.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

const grab = (t, sig) => {
  const at = t.indexOf(sig);
  if (at < 0) throw new Error('not found: ' + sig);
  let from = at, p = 0;
  for (let i = at; i < t.length; i++) {
    if (t[i] === '(') p++;
    else if (t[i] === ')') { p--; if (!p) { from = t.indexOf('{', i); break; } }
  }
  let d = 0, st = false;
  for (let i = from; i < t.length; i++) {
    if (t[i] === '{') { d++; st = true; }
    else if (t[i] === '}') { d--; if (st && !d) return t.slice(at, i + 1); }
  }
  throw new Error('unbalanced: ' + sig);
};

let bad = 0;
const check = (what, ok, detail) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + what + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
  if (!ok) bad++;
};

/* The sample is three round turns' worth of the real file, in its real shape:
 * two accounts sharing a `created_on`, a long and a short, and one leg with no
 * partner. Written out rather than read from Downloads, because a probe that
 * needs a file nobody else has is a probe that fails on the other machine. */
const CSV = [
  'name,order_id,symbol,mov_time,mov_type,exec_qty,price_done,points,profit,created_on',
  'APEX-26922-1703,NSZFDLH5ZMUO7WNVH,CM.NQZ6,Wed Sep 30 2026 10:48:46 GMT-0400 (Eastern Daylight Time),2,-5,30831.5,52.5,1034.5,2026-09-30T14:45:49.000Z',
  'APEX-26922-1704,FK3FDLH5ZMUO7WNVM,CM.NQZ6,Wed Sep 30 2026 10:48:46 GMT-0400 (Eastern Daylight Time),2,-5,30831.5,52.5,1034.5,2026-09-30T14:45:49.000Z',
  'APEX-26922-1704,FK3FDLH5ZMUO7WNVK,CM.NQZ6,Wed Sep 30 2026 10:45:50 GMT-0400 (Eastern Daylight Time),1,5,30821,,,2026-09-30T14:45:49.000Z',
  'APEX-26922-1703,NSZFDLH5ZMUO7WNVF,CM.NQZ6,Wed Sep 30 2026 10:45:50 GMT-0400 (Eastern Daylight Time),1,5,30821,,,2026-09-30T14:45:49.000Z',
  'APEX-26922-1704,FK3VZAUPTMUO7VNVS,CM.NQZ6,Wed Sep 30 2026 10:45:03 GMT-0400 (Eastern Daylight Time),3,-1,30796,,,2026-09-30T14:45:03.000Z',
  'APEX-26922-1704,FK3MHE00CMUO7W5N3,CM.NQZ6,Wed Sep 30 2026 10:47:00 GMT-0400 (Eastern Daylight Time),4,1,30811,15,-303.1,2026-09-30T14:45:03.000Z',
  'APEX-26922-1703,ORPHANZZZZZZZZZZZ,CM.NQZ6,Wed Sep 30 2026 11:00:00 GMT-0400 (Eastern Daylight Time),1,2,30900,,,2026-09-30T15:00:00.000Z'
].join('\n');

const fold = new Function(
  imp.match(/const norm = [^;]+;/)[0] + '\n' +
  grab(imp, 'function sniffDelimiter(') + '\n' +
  grab(imp, 'function parseDelimited(') + '\n' +
  grab(imp, 'function guessHeaderRow(') + '\n' +
  imp.match(/const WC_OPEN = [^;]+;/)[0] + '\n' +
  grab(imp, 'function looksLikeFills(') + '\n' +
  grab(imp, 'function foldFills(') +
  '; return { sniffDelimiter, parseDelimited, foldFills, looksLikeFills };')();

// ------------------------------------------------------------ the fold

const grid = fold.parseDelimited(CSV, fold.sniffDelimiter(CSV));
check('the delimiter is a comma', fold.sniffDelimiter(CSV) === ',');
check('and the file is recognised as fills', fold.looksLikeFills(grid[0]));

const [folded, note] = fold.foldFills(grid);
check('three round turns come out of seven fills', folded.length - 1 === 3, folded.length - 1);
check('and the leg with no partner is reported rather than dropped in silence',
      /1 leg had no pair|no pair/.test(note), note);

{
  const row = folded[1];
  const head = folded[0];
  const at = (name) => row[head.indexOf(name)];
  check('the venue prefix comes off the symbol', at('symbol') === 'NQZ6', at('symbol'));
  check('the opening price is the entry', String(at('entry')) === '30821');
  check('and the closing price the exit', String(at('exit')) === '30831.5');
  check('the account comes from the file, not from a box',
        at('account') === 'APEX-26922-1703', at('account'));
}

// ------------------------------------------- the mapping, with no box filled

const shared = [
  app.match(/const hm = [^;]+;/)[0],
  app.match(/const SESSIONS = \[[\s\S]*?\n\];/)[0],
  grab(app, 'export function sessionAt(').replace('export ', ''),
  grab(app, 'export function toNumber(').replace('export ', ''),
  app.match(/export const CONTRACTS = \{[\s\S]*?\n\};/)[0].replace('export ', ''),
  grab(app, 'export function contractFor(').replace('export ', '')
].join('\n');

const parts = [
  imp.match(/const FIELDS = \[[\s\S]*?\n\];/)[0],
  imp.match(/const PAIRED = \[[\s\S]*?\n\];/)[0],
  imp.match(/const ALL_FIELDS = [^;]+;/)[0],
  imp.match(/const norm = [^;]+;/)[0],
  grab(imp, 'function autoMap('),
  grab(imp, 'function columnsFor('),
  grab(imp, 'function numericValue('),
  'let mapping = autoMap();',
  grab(imp, 'function raw('),
  grab(imp, 'function text('),
  grab(imp, 'function numeric('),
  grab(imp, 'function parseSide('),
  grab(imp, 'function parseStamp('),
  'const skipped = {};',
  grab(imp, 'function skip('),
  grab(imp, 'function rootSymbol('),
  grab(imp, 'function fingerprint('),
  grab(imp, 'function mapRow(')
].join('\n');

const api = new Function('headers', 'rows', 'headerAt',
  shared + '\n' + parts + '\n; return { mapping, mapRow, skipped, columnsFor };')(
    folded[0], folded, 0);

check('every required column is recognised without being told',
      api.columnsFor('opened_at').length === 1 &&
      api.columnsFor('symbol').length === 1 &&
      api.columnsFor('direction').length === 1);

check('AND THE ACCOUNT COLUMN IS ONE OF THEM, which is the whole point',
      api.columnsFor('account').length === 1, api.columnsFor('account'));

{
  // The fallback is empty, exactly as it is when somebody drops a file in
  // without typing anything. Every row must still land under a real account.
  const out = folded.slice(1).map((r) => api.mapRow(r, '', false)).filter(Boolean);

  check('every row survives with no account typed', out.length === 3,
        { mapped: out.length, skipped: api.skipped });
  check('and none of them lands under no account at all',
        out.every((r) => r.account && r.account.startsWith('APEX-')),
        out.map((r) => r.account));

  const first = out.find((r) => r.external_id.startsWith('NSZ'));
  check('a long reads as a long', first.direction === 'long');
  check('points are recomputed from the prices, not taken from the file',
        first.points === 10.5, first.points);
  check('and the profit is the file\'s, which is net of commission',
        first.net_pnl === 1034.5, first.net_pnl);

  const short = out.find((r) => r.direction === 'short');
  check('a short reads as a short and keeps its loss',
        short && short.net_pnl === -303.1, short && short.net_pnl);
}

// -------------------------------------- the gate that caused the blank page

{
  const src = imp;

  check('the file is no longer refused before it is read',
        !/if \(!\$\('acct'\)\.value\.trim\(\)\) \{[\s\S]{0,200}\$\('file'\)\.value = ''/.test(src));

  check('and the box is no longer marked required',
        !/id="acct"[^>]*\brequired\b/.test(src),
        (src.match(/<input id="acct"[^>]*>/) || [''])[0]);

  check('a file with no account column is still asked about',
        /Which account are these\?/.test(src));

  check('and it is asked beside the preview, where the file is still loaded',
        /Your file is still loaded/.test(src));

  check('typing in the box re-reads at once rather than on blur',
        /\$\('acct'\)\.addEventListener\('input'/.test(src));
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
