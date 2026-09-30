/* WHAT ENDS A LIVE ACCOUNT, AND WHEN.
 *
 * A prop account is ended by a drawdown somebody set. A live account is ended
 * by margin, and the two behave nothing alike - which is why this site could
 * reason about the first and had nothing to say about the second until a live
 * margin account arrived in the journal on 30 September 2026.
 *
 * THE ADVERTISED NUMBER APPLIES FOR LEAST OF THE DAY. NinjaTrader's published
 * table, read 30 September 2026:
 *
 *     MNQ   intraday   $100.00      initial   $4,742.61
 *     MES   intraday    $50.00      initial   $2,870.74
 *     NQ    intraday  $1,000.00     initial  $47,426.09
 *
 * Intraday runs from the product open until FIFTEEN MINUTES BEFORE the session
 * close - 15:45 Chicago for the index contracts - after which initial is
 * required. Forty-seven times, on a schedule, whether or not anybody is
 * watching, and an account that cannot meet it is liquidated and charged a fee.
 *
 * So the question worth answering from a journal is not "what is the margin",
 * which is a lookup, but "was this position still open when the cheap rate
 * ended". That is what is pinned here, and the case it exists for is the one
 * that is easy to get wrong in both directions:
 *
 *   - the cutoff is a NEW YORK wall clock, so it moves against UTC twice a
 *     year. A test written in summer passes all winter while the answer is an
 *     hour out.
 *   - a trade with no closing time cannot be answered at all, and counting it
 *     as safe would make the figure reassuring rather than true.
 *
 *     node tools/probe-margin.mjs
 */
import fs from 'node:fs';

const src = fs.readFileSync('app.js', 'utf8');

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

const { MARGINS, marginFor, heldPastIntraday } = new Function(
  src.match(/export const MARGINS = \{[\s\S]*?\n\};/)[0].replace('export ', '') + '\n' +
  src.match(/const INTRADAY_ENDS_NY = [^;]+;/)[0] + '\n' +
  grab(src, 'export function marginFor(').replace('export ', '') + '\n' +
  grab(src, 'export function heldPastIntraday(').replace('export ', '') +
  '; return { MARGINS, marginFor, heldPastIntraday };')();

let bad = 0;
const check = (what, ok, detail) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + what + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
  if (!ok) bad++;
};

// ------------------------------------------------- the table, as published

check('MNQ intraday is the advertised hundred', MARGINS.MNQ.day === 100);
check('and initial is nearly five thousand', MARGINS.MNQ.initial === 4742.61);
check('which is 47 times the advertised figure',
      Math.round(MARGINS.MNQ.initial / MARGINS.MNQ.day) === 47,
      +(MARGINS.MNQ.initial / MARGINS.MNQ.day).toFixed(1));

check('every contract carries all three figures',
      Object.values(MARGINS).every((m) => m.day > 0 && m.maintenance > 0 && m.initial > 0));
check('and initial is never below maintenance',
      Object.values(MARGINS).every((m) => m.initial >= m.maintenance));

check('a symbol with its expiry still finds its margin',
      marginFor('MNQ DEC26') === MARGINS.MNQ, marginFor('MNQ DEC26'));
check('and a contract-month code too', marginFor('MNQZ5') === MARGINS.MNQ);
check('a symbol with no published figure says so', marginFor('CL') === null);
check('and so does nothing at all', marginFor('') === null && marginFor(null) === null);

// ------------------------------------- still open when the cheap rate ended

/* 16:45 New York is the cutoff. These are written in UTC on purpose: the
 * point is that the answer follows New York and not the offset. */
const trade = (opened_at, closed_at) => heldPastIntraday({ opened_at, closed_at });

{
  // Summer, EDT, UTC-4. 16:45 New York is 20:45 UTC.
  check('a morning trade is on the cheap rate',
        trade('2026-09-30T15:16:00Z', '2026-09-30T15:17:00Z') === false);
  check('closing one minute before the cutoff is still cheap',
        trade('2026-09-30T20:30:00Z', '2026-09-30T20:44:00Z') === false);
  check('closing one minute after it is not',
        trade('2026-09-30T20:30:00Z', '2026-09-30T20:46:00Z') === true);
  check('and opening after it never was',
        trade('2026-09-30T21:00:00Z', '2026-09-30T21:05:00Z') === true);
}

{
  /* WINTER. EST is UTC-5, so 16:45 New York is 21:45 UTC - an hour later than
   * in summer. A cutoff held as a UTC time would call both of these the same
   * and be wrong about one of them for five months of the year. */
  check('16:43 New York in January is cheap',
        trade('2026-01-15T21:30:00Z', '2026-01-15T21:43:00Z') === false);
  check('16:47 New York in January is not',
        trade('2026-01-15T21:44:00Z', '2026-01-15T21:47:00Z') === true);

  // The same UTC time, the other side of the cutoff, in the other season.
  check('20:46 UTC is past the cutoff in September',
        trade('2026-09-30T20:30:00Z', '2026-09-30T20:46:00Z') === true);
  check('and is not in January', trade('2026-01-15T20:30:00Z', '2026-01-15T20:46:00Z') === false);
}

{
  // Held overnight, and held across a weekend.
  check('a position carried to the next morning was held past it',
        trade('2026-09-30T22:00:00Z', '2026-10-01T13:00:00Z') === true);
  check('and one carried over a weekend',
        trade('2026-10-02T17:00:00Z', '2026-10-05T14:00:00Z') === true);
}

{
  /* NO CLOSE IS NOT "NO". A broker export that carries an entry and no exit is
   * common, and answering `false` would make this figure reassuring rather
   * than true - the one direction it must never be wrong in. */
  check('no closing time is unanswerable',
        trade('2026-09-30T15:16:00Z', null) === null);
  check('and so is no opening time', trade(null, '2026-09-30T15:17:00Z') === null);
  check('and so is a stamp that is not a date',
        trade('2026-09-30T15:16:00Z', 'not a date') === null);
  check('and so is nothing at all', heldPastIntraday(null) === null);
}

// ------------------------------------------- the real file, row by row

{
  /* The NinjaTrader grid of 30 September 2026: nine MNQ trades on a live
   * margin account, every one of them inside the New York morning. Not one
   * touched the initial-margin window, which is the answer the block should
   * give for that day - and the fixture exists so that it staying the answer
   * is not an accident. */
  const REAL = [
    ['9/30/2026 11:16:00 AM', '9/30/2026 11:16:21 AM'],
    ['9/30/2026 11:16:31 AM', '9/30/2026 11:17:33 AM'],
    ['9/30/2026 11:18:25 AM', '9/30/2026 11:18:46 AM'],
    ['9/30/2026 11:18:58 AM', '9/30/2026 11:21:14 AM'],
    ['9/30/2026 11:19:36 AM', '9/30/2026 11:21:14 AM'],
    ['9/30/2026 11:19:41 AM', '9/30/2026 11:21:14 AM'],
    ['9/30/2026 11:19:44 AM', '9/30/2026 11:21:14 AM'],
    ['9/30/2026 11:19:47 AM', '9/30/2026 11:21:14 AM'],
    ['9/30/2026 11:30:29 AM', '9/30/2026 11:32:21 AM']
  ].map(([o, c]) => ({
    // Chicago platform time, which is New York less an hour.
    opened_at: new Date(o + ' GMT-0500').toISOString(),
    closed_at: new Date(c + ' GMT-0500').toISOString()
  }));

  check('all nine real trades are answerable',
        REAL.every((r) => heldPastIntraday(r) !== null));
  check('and none of them was held past the cutoff',
        REAL.every((r) => heldPastIntraday(r) === false),
        REAL.filter((r) => heldPastIntraday(r)).length);

  // What the day would have cost had one been carried.
  const one = MARGINS.MNQ;
  check('carrying one of them would have needed the initial figure',
        one.initial - one.day === 4642.61, +(one.initial - one.day).toFixed(2));
}

// -------------------------------------- the same arithmetic in points

/* "$900 of room" is correct and lands as nothing. "450 points" is the same
 * fact in the unit somebody watches all day.
 *
 * The shape is the point: room collapses roughly with the SQUARE of size,
 * because every contract added both raises the margin held and raises what a
 * point costs. Nine times the size is not nine times the risk. A table makes
 * that obvious and a sentence does not, so the table has to be right.
 */
const props = fs.readFileSync('props.html', 'utf8');

const { escapeHtml, money, CONTRACTS, contractFor } = new Function(
  grab(src, 'export function escapeHtml(').replace('export ', '') + '\n' +
  grab(src, 'export function money(').replace('export ', '') + '\n' +
  src.match(/export const CONTRACTS = \{[\s\S]*?\n\};/)[0].replace('export ', '') + '\n' +
  grab(src, 'export function contractFor(').replace('export ', '') +
  '; return { escapeHtml, money, CONTRACTS, contractFor };')();

const roomTable = new Function('escapeHtml', 'money',
  grab(props, 'function roomTable(') + '; return roomTable;')(escapeHtml, money);

// The figures out of a rendered row, so the test reads what a member reads.
const rows = (html) => [...html.matchAll(/<tr>(?!<th)([\s\S]*?)<\/tr>/g)]
  .map((m) => [...m[1].matchAll(/<td>([\s\S]*?)<\/td>/g)]
    .map((c) => c[1].replace(/<[^>]*>/g, '').trim()))
  .filter((cells) => cells.length === 5);

{
  const html = roomTable(1000, MARGINS.MNQ, CONTRACTS.MNQ, 1);
  const table = rows(html);

  check('a thousand dollars opens ten micro contracts and no more',
        table[table.length - 1][0] === '10', table.map((r) => r[0]));

  const one = table.find((r) => r[0].startsWith('1 '));
  check('one contract holds a hundred', one[1] === '$100.00', one);
  check('leaving nine hundred', one[2] === '$900.00', one);
  check('at two dollars a point', one[3] === '$2.00', one);
  check('which is 450 points', one[4] === '450', one);

  const five = table.find((r) => r[0] === '5');
  check('five contracts leave fifty points, not ninety',
        five[4] === '50', five);

  check('the largest position taken is marked',
        /your largest/.test(table.find((r) => r[0].startsWith('1 '))[0]), table[0]);
}

{
  // Floored, not rounded. 700/6 is 116.67 and the honest answer is 116: the
  // direction to be wrong in here is the one that leaves room over.
  const table = rows(roomTable(1000, MARGINS.MNQ, CONTRACTS.MNQ, 0));
  const three = table.find((r) => r[0] === '3');
  check('points are floored rather than rounded up', three[4] === '116', three);
}

{
  // A size the balance cannot open is a row about somebody else.
  const table = rows(roomTable(450, MARGINS.MNQ, CONTRACTS.MNQ, 0));
  check('no row for a position the balance cannot take',
        table.every((r) => Number(r[0]) <= 4), table.map((r) => r[0]));
}

{
  // A position the member has actually taken is always in the table, even
  // when it is not one of the round numbers.
  const table = rows(roomTable(1000, MARGINS.MNQ, CONTRACTS.MNQ, 7));
  check('an unround largest position still gets its row',
        table.some((r) => r[0].startsWith('7 ')), table.map((r) => r[0]));
}

{
  const html = roomTable(60, MARGINS.MNQ, CONTRACTS.MNQ, 0);
  check('a balance under one contract says so rather than drawing nothing',
        /does not cover/.test(html) && !/<table/.test(html), html.slice(0, 120));
}

{
  check('no balance draws no table', roomTable(null, MARGINS.MNQ, CONTRACTS.MNQ, 1) === '');
  check('and neither does a symbol with no spec',
        roomTable(1000, MARGINS.MNQ, null, 1) === '');
  check('nor one with no published margin', roomTable(1000, null, CONTRACTS.MNQ, 1) === '');
}

{
  /* THE CAVEAT IS PART OF THE TABLE, not something to remember to add. These
   * are points to the margin requirement; their own page implies a floor above
   * it on at least one contract, and the difference is somebody's account. */
  const html = roomTable(1000, MARGINS.MNQ, CONTRACTS.MNQ, 1);
  check('it says the figures run to the requirement, not to zero',
        /floor at twice the margin/.test(html));
  check('and that an open position counts the whole way',
        /at every moment of the trade/.test(html));
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
