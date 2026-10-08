/* AN ORDER IS NOT A TRADE, AND THE ORDERS GRID IS THE WRONG EXPORT.
 *
 * `NinjaTrader Grid 2026-10-08 12-00 PM.csv`: three rows, two filled and one
 * cancelled, one row per ORDER. Imported, it produced nothing visible - and
 * reported success doing it.
 *
 * Nothing errored. Every required field mapped: a time, an instrument, a side.
 * What it had no column for was a RESULT - the Orders grid carries no exit and
 * no profit, because those live in the Trades grid, which pairs each entry
 * with its exit and nets the commission. So three rows arrived with nothing to
 * count, and every page that counts money asks for a result first.
 *
 * A success message over an empty journal is the worst shape this page can
 * fail in. Two things are pinned here:
 *
 *   1. an order that never filled is dropped before anything looks at it;
 *   2. an orders grid with no exit and no profit is refused by name, with the
 *      right export named beside it.
 *
 *     node tools/probe-nt-orders.mjs
 */
import fs from 'node:fs';

const imp = fs.readFileSync('import.html', 'utf8');

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

const api = new Function(
  imp.match(/const norm = [^;]+;/)[0] + '\n' +
  grab(imp, 'function sniffDelimiter(') + '\n' +
  grab(imp, 'function parseDelimited(') + '\n' +
  grab(imp, 'function guessHeaderRow(') + '\n' +
  imp.match(/const DEAD_STATES = new Set\(\[[\s\S]*?\]\);/)[0] + '\n' +
  grab(imp, 'function dropUnfilled(') + '\n' +
  grab(imp, 'function looksLikeOrders(') +
  '; return { sniffDelimiter, parseDelimited, dropUnfilled, looksLikeOrders };')();

let bad = 0;
const check = (what, ok, detail) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + what + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
  if (!ok) bad++;
};

// The real file, header and all, including its trailing comma.
const CSV = [
  'Instrument,Action,Type,Quantity,Limit,Stop,State,Filled,Avg. price,Remaining,Name,OCO,TIF,Account,Connection,ID,Strategy,Time,',
  'MNQ DEC26,Sell,Market,1,0,0,Filled,1,31188.25,0,,,GTC,2234697,Live,20053580933,,10/8/2026 10:55:29 AM,',
  'MNQ DEC26,Buy,Stop Market,1,0,0,Filled,1,31185.75,0,,,GTC,2234697,Live,20053580943,,10/8/2026 10:55:58 AM,',
  'MNQ DEC26,Buy,Limit,1,0,0,Cancelled,0,0,1,,,GTC,2234697,Live,20053580946,,10/8/2026 10:55:46 AM,'
].join('\n');

const grid = api.parseDelimited(CSV, api.sniffDelimiter(CSV));

// ------------------------------------------- an order that never filled

{
  const [kept, dropped] = api.dropUnfilled(grid);

  check('the cancelled order is dropped', dropped === 1, dropped);
  check('and the two fills are kept', kept.length - 1 === 2, kept.length - 1);
  check('the header survives', kept[0][0] === 'Instrument');
  check('and the row dropped is the cancelled one',
        !kept.slice(1).some((r) => r[15] === '20053580946'),
        kept.slice(1).map((r) => r[15]));
}

{
  /* A QUANTITY OF ZERO IS DECISIVE AND A WORD IS NOT. Platforms spell their
   * states differently, so an unrecognised one must keep the row - taking a
   * real fill out of a file over a word nobody here has seen is the expensive
   * direction to be wrong in. */
  const head = 'Instrument,Action,Quantity,State,Filled';
  const odd = [head, 'MNQ,Buy,1,PartiallyFilledSomehow,1'].join('\n');
  const [kept, dropped] = api.dropUnfilled(api.parseDelimited(odd, ','));
  check('an unknown state keeps its row', dropped === 0 && kept.length === 2, { dropped });

  const zero = [head, 'MNQ,Buy,1,SomethingElse,0'].join('\n');
  const [, gone] = api.dropUnfilled(api.parseDelimited(zero, ','));
  check('but a filled quantity of zero is dropped whatever the word says', gone === 1, gone);
}

{
  // A file with neither column is not touched at all.
  const plain = ['When,Symbol,Side,Qty', '2026-10-08,MNQ,Buy,1'].join('\n');
  const [kept, dropped] = api.dropUnfilled(api.parseDelimited(plain, ','));
  check('a file with no state column is left alone',
        dropped === 0 && kept.length === 2, { dropped });
}

// --------------------------------------------- recognising the wrong export

{
  check('the orders grid is recognised', api.looksLikeOrders(grid[0]));

  // The TRADES grid, which is the right export, must NOT be caught by this.
  const trades = ('Trade number,Instrument,Account,Strategy,Market pos.,Qty,Entry price,' +
    'Exit price,Entry time,Exit time,Entry name,Exit name,Profit,Cum. net profit,Commission,' +
    'Clearing Fee,Exchange Fee,IP Fee,NFA Fee,MAE,MFE,ETD,Bars,').split(',');
  check('and the Trades grid is not', !api.looksLikeOrders(trades));

  // Nor is the WealthCharts fills export, which has its own path.
  const fills = 'name,order_id,symbol,mov_time,mov_type,exec_qty,price_done,points,profit,created_on'.split(',');
  check('nor a WealthCharts orders export', !api.looksLikeOrders(fills));

  // Nor an ordinary journal re-export.
  check('nor a plain journal file',
        !api.looksLikeOrders(['when', 'symbol', 'side', 'quantity', 'entry', 'exit', 'net p&l']));
}

// ---------------------------------------------- what the page does about it

{
  const src = imp;

  check('the refusal names the grid it is looking at', /This is the Orders grid/.test(src));
  check('and names the one to use instead', /Export the Trades tab instead/.test(src));
  check('and says why these would vanish rather than error',
        /appear nowhere/.test(src) && /ask for a result/.test(src));

  /* THE TEST IS AN EXIT OR A PROFIT, NOT A PRICE. `Avg. price` maps to the
   * entry - rightly, on a file with one price column - and an earlier version
   * of this checked for `entry`, which switched the warning off while every
   * row still had no result. The fill price of an order is an entry on one row
   * and an exit on another, and neither row knows which. */
  check('the refusal turns on an exit or a profit, not on any price',
        /ordersGrid && columnsFor\('exit_price'\)\.length === 0 &&\s*columnsFor\('net_pnl'\)\.length === 0/
          .test(src));

  check('the file stays loaded so the mapping can be corrected',
        /Your file is still loaded/.test(src));

  check('`Avg. price` is understood as a fill price', /'avgprice'/.test(src));
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
