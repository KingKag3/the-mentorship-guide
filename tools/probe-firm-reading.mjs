/* THE FIRM'S OWN NUMBERS, AND WHAT CAN BE READ BACK OUT OF THEM.
 *
 * The fixture is real. Nineteen funded accounts on an Apex dashboard,
 * 25 September 2026, all "Legacy 250k Wealthcharts":
 *
 *     NAME               PNL       STOP      BALANCE
 *     PA-APEX-26922-74   728.20    244,393   250,728.20
 *     PA-APEX-26922-75   696.30    244,361   250,696.30
 *     ... seventeen more identical to -75 ...
 *
 * Four things fall straight out of that, and they are why this probe exists.
 *
 *   1. `balance - pnl` is 250,000.00 on every row, to the cent. The account
 *      size is exactly 250,000 and the PNL column is measured from the start.
 *
 *   2. STOP is an ABSOLUTE ACCOUNT VALUE, not an allowance. It is the number
 *      the account dies at. Confusing it with the allowance - which for this
 *      product is a few thousand - is a two-hundred-and-forty-thousand-dollar
 *      mistake, which is why they are separate columns and why this is tested.
 *
 *   3. The threshold tracks the balance dollar for dollar. Between -74 and the
 *      other eighteen, the balance differs by $31.90 and the stop by $32 -
 *      the same move, with the stop displayed to the whole dollar. Not a
 *      percentage, not a lagging figure.
 *
 *   4. `balance - stop` is 6,335.30 and 6,335.20 - the same to a dime across
 *      accounts that closed $31.90 apart. Both gave back the same amount from
 *      their own peak, which is what copied trading looks like from outside.
 *
 * The allowance itself is NOT in the fixture, because the dashboard does not
 * show it. $6,500 is the published figure for a 250k Apex account and it is
 * used here as an assumption, marked as one. The point of the arithmetic below
 * is that it does not need to be right for the reconciliation to be useful: a
 * wrong allowance shows up as the third verdict, an impossible peak.
 *
 *     node tools/probe-firm-reading.mjs
 */
import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');
const props = fs.readFileSync('props.html', 'utf8');

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

const { toNumber, money, escapeHtml } = new Function(
  grab(app, 'export function toNumber(').replace('export ', '') + '\n' +
  grab(app, 'export function money(').replace('export ', '') + '\n' +
  grab(app, 'export function escapeHtml(').replace('export ', '') +
  '; return { toNumber, money, escapeHtml };')();

const makeFirmBlock = (optionalMissing) => new Function(
  'toNumber', 'money', 'escapeHtml', 'optionalMissing',
  props.match(/const READING_STALE_DAYS = [^;]+;/)[0] + '\n' +
  grab(props, 'function stateAsAt(') + '\n' +
  grab(props, 'function firmBlock(') + '; return firmBlock;')(
    toNumber, money, escapeHtml, optionalMissing);

const firmBlock = makeFirmBlock(false);

let bad = 0;

/* The detail here is a block of HTML rather than a number, so it is printed
 * only when something fails. A passing run that dumps eighteen copies of the
 * same paragraph is a run nobody reads. */
const check = (what, ok, detail) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + what);
  if (!ok && detail !== undefined) console.log('     ' + detail);
  if (!ok) bad++;
};

const today = new Date().toISOString().slice(0, 10);

// The dashboard, as read.
const SIZE = 250000;
const ALLOWANCE = 250000 - 243500;        // 6,500 - the published figure, assumed.
const ROW = { balance: 250696.30, stop: 244361 };
const FIRST = { balance: 250728.20, stop: 244393 };

/* What the page is handed about the journal.
 *
 * `stateOn` is the dated part and the reason this fixture is not just two
 * numbers: the reading is taken on a day, and the journal it is checked
 * against has to be the journal AS IT WAS on that day. The first real reading
 * made that obvious - a dashboard read on the 25th against a journal carrying
 * the 26th's trading reported every account as hundreds of dollars over. */
const READ_ON = '2026-09-25';
const walk = (held, peak, extra) => ({
  held, peak, withdrawn: 0, markFalls: false,
  stateOn: new Map([[READ_ON, { total: held, held, peak, withdrawn: 0 }]]),
  ...extra
});
const cfg = (over) => ({ size: SIZE, firm_seen_on: READ_ON, ...over });

// ------------------------------------------------- what the dashboard itself says

check('balance less PNL is the account size, to the cent',
      Math.abs((ROW.balance - 696.30) - SIZE) < 0.005 &&
      Math.abs((FIRST.balance - 728.20) - SIZE) < 0.005);

check('the stop moves with the balance, dollar for dollar',
      Math.round(FIRST.balance - ROW.balance) === FIRST.stop - ROW.stop,
      { balance: +(FIRST.balance - ROW.balance).toFixed(2), stop: FIRST.stop - ROW.stop });

check('and the room left is the same across copies, to a dime',
      Math.abs((ROW.balance - ROW.stop) - (FIRST.balance - FIRST.stop)) <= 0.10,
      [+(ROW.balance - ROW.stop).toFixed(2), +(FIRST.balance - FIRST.stop).toFixed(2)]);

// --------------------------------------------------------- what the card says

{
  const html = firmBlock(cfg({ firm_balance: ROW.balance, firm_threshold: ROW.stop }),
                         walk(696.30, 861), ALLOWANCE, false);

  check('room left is the firm\'s subtraction, not ours', html.includes('$6,335.30'), html);
  check('and is given as the headline', html.includes('Room left: $6,335.30'));
  check('it says whose arithmetic it is', html.includes('not ours'));

  check('a journal that matches the firm is told so',
        html.includes('agrees with the firm to the cent'), html);

  /* The finding the estimate could never produce. The firm's high-water mark
   * is the threshold plus the allowance; the journal's is the best close. */
  check('a threshold anchored to the best close is named as exact',
        html.includes('follows your closed balance') && html.includes('it is exact'), html);
}

{
  /* The same account with a journal that only ever saw the close. 861 - 696.30
   * is $164.70 of profit that moved the threshold and never got closed. */
  const html = firmBlock(cfg({ firm_balance: ROW.balance, firm_threshold: ROW.stop }),
                         walk(696.30, 696.30), ALLOWANCE, false);

  check('unrealised profit in the threshold is measured, not assumed',
        html.includes('$164.70'), html);
  check('and named as an intraday trail', html.includes('intraday'), html);
  check('with the warning that room figures overstate', html.includes('overstates'), html);
}

{
  // A journal peak above the implied one is impossible on a trailing account,
  // so it is reported as the contradiction it is rather than shown as a gap.
  const html = firmBlock(cfg({ firm_balance: ROW.balance, firm_threshold: ROW.stop }),
                         walk(696.30, 1000), ALLOWANCE, false);

  check('an impossible peak is called out', html.includes('should not happen'), html);
  check('and the wrong allowance is offered as the likely cause',
        html.includes('allowance recorded above is wrong'), html);
}

{
  // The import check. On copied accounts this is the only thing that can find
  // a short import, because eighteen other cards look equally plausible.
  const html = firmBlock(cfg({ firm_balance: ROW.balance, firm_threshold: ROW.stop }),
                         walk(600, 861), ALLOWANCE, false);

  check('a short journal is quantified', html.includes('$96.30') && html.includes('missing from'),
        html);
}

{
  const html = firmBlock(cfg({ firm_balance: ROW.balance, firm_threshold: ROW.stop }),
                         walk(800, 861), ALLOWANCE, false);
  check('and so is a journal holding more than the firm does',
        html.includes('extra in'), html);
}

// ------------------------------------------------- when it declines to answer

{
  const locked = firmBlock(cfg({ firm_balance: ROW.balance, firm_threshold: ROW.stop }),
                           walk(696.30, 861), ALLOWANCE, true);
  check('a locked threshold gives room and no peak',
        locked.includes('$6,335.30') && locked.includes('no longer anchored') &&
        !locked.includes('high-water mark is $861'), locked);

  const noDd = firmBlock(cfg({ firm_balance: ROW.balance, firm_threshold: ROW.stop }),
                         walk(696.30, 861), null, false);
  check('no allowance asks for one rather than guessing',
        noDd.includes('Fill in the drawdown allowance'), noDd);

  const paid = firmBlock(cfg({ firm_balance: ROW.balance, firm_threshold: ROW.stop }),
                         walk(696.30, 861, {
                           withdrawn: 5000, markFalls: true,
                           stateOn: new Map([[READ_ON, { total: 696.30, held: 696.30,
                                                         peak: 861, withdrawn: 5000 }]])
                         }),
                         ALLOWANCE, false);
  check('a payout that moved the mark stops the arithmetic',
        paid.includes('payout has moved the mark'), paid);

  // Half a reading is not a reading, and is not silence either: the column is
  // plainly there, so the answer is to ask for the other number.
  const half = firmBlock(cfg({ firm_balance: ROW.balance }), walk(696.30, 861), ALLOWANCE, false);
  check('half a reading gives no room figure', !half.includes('Room left'), half);
  check('and asks for the other number', half.includes('Two numbers from your firm'), half);
}

// ------------------------------------------------------------ how old it is

{
  const old = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
  const html = firmBlock({ size: SIZE, firm_seen_on: old, firm_balance: ROW.balance,
                           firm_threshold: ROW.stop },
                         walk(696.30, 861, {
                           stateOn: new Map([[old, { total: 696.30, held: 696.30,
                                                     peak: 861, withdrawn: 0 }]])
                         }), ALLOWANCE, false);
  check('a stale reading says so and how stale',
        html.includes('21 days ago') && html.includes('Take it again'), html);

  const undated = firmBlock({ size: SIZE, firm_balance: ROW.balance, firm_threshold: ROW.stop },
                            walk(696.30, 861), ALLOWANCE, false);
  check('an undated one admits it cannot tell', undated.includes('no telling'), undated);

  const fresh = firmBlock({ size: SIZE, firm_seen_on: today,
                            firm_balance: ROW.balance, firm_threshold: ROW.stop },
                          walk(696.30, 861, {
                            stateOn: new Map([[today, { total: 696.30, held: 696.30,
                                                        peak: 861, withdrawn: 0 }]])
                          }), ALLOWANCE, false);
  check('and a reading taken today is not nagged about', fresh.includes('Read today.'));
}

// ----------------------------------------------- the reading has a date on it

{
  /* THE FIRST REAL READING FOUND THIS.
   *
   * The dashboard was read on 25 September and the journal carried the 26th's
   * trading as well. Comparing the reading with the journal's CURRENT total
   * reports the account as hundreds of dollars over - on all nineteen copied
   * cards, identically, which makes it look like a finding rather than a bug. */
  const later = walk(696.30, 861, {
    held: 1467.10, peak: 1467.10,
    stateOn: new Map([
      ['2026-09-25', { total: 696.30, held: 696.30, peak: 861, withdrawn: 0 }],
      ['2026-09-26', { total: 1467.10, held: 1467.10, peak: 1467.10, withdrawn: 0 }]
    ])
  });

  const html = firmBlock(cfg({ firm_balance: ROW.balance, firm_threshold: ROW.stop }),
                         later, ALLOWANCE, false);

  check('a later day in the journal does not read as a discrepancy',
        html.includes('agrees with the firm to the cent'), html);
  check('and the verdict uses that day\'s peak, not the latest',
        html.includes('follows your closed balance'), html);
}

{
  // A reading taken on a day nothing was traded compares against the last
  // close before it, and says which day that was.
  const gap = walk(696.30, 861, {
    stateOn: new Map([['2026-09-24', { total: 696.30, held: 696.30, peak: 861, withdrawn: 0 }]])
  });
  const html = firmBlock(cfg({ firm_balance: ROW.balance, firm_threshold: ROW.stop }),
                         gap, ALLOWANCE, false);
  check('a quiet day falls back to the last close, and names it',
        html.includes('last close before then, 2026-09-24'), html);
}

{
  // Nothing that early at all is a real answer, not a zero to subtract from.
  const young = walk(696.30, 861, {
    stateOn: new Map([['2026-09-26', { total: 696.30, held: 696.30, peak: 861, withdrawn: 0 }]])
  });
  const html = firmBlock(cfg({ firm_balance: ROW.balance, firm_threshold: ROW.stop }),
                         young, ALLOWANCE, false);
  check('a journal with nothing that early says so rather than comparing',
        html.includes('nothing to check the reading against'), html);
  check('and still gives the room, which needs no journal at all',
        html.includes('$6,335.30'), html);
}

{
  // Without a date there is nothing to compare against, and the page asks for
  // one instead of quietly comparing two different days.
  const html = firmBlock({ size: SIZE, firm_balance: ROW.balance, firm_threshold: ROW.stop },
                         walk(696.30, 861), ALLOWANCE, false);
  check('an undated reading asks for the date', html.includes('Put the date you read these in'),
        html);
  check('and makes no claim about the journal',
        !html.includes('agrees with the firm') && !html.includes('missing from'), html);
}

// --------------------------------------- an empty box is not a missing column

{
  /* The fields sit inside a collapsed section and the block only appears once
   * something is saved, so somebody who has just run the migration has nothing
   * to look at. `undefined` (never selected) and `null` (selected and empty)
   * are different facts and the page uses both. */
  const ran = firmBlock({ size: SIZE, firm_balance: null, firm_threshold: null },
                        walk(696.30, 861), ALLOWANCE, false);
  check('an empty reading on a page that can hold one invites it',
        ran.includes('Two numbers from your firm'), ran);

  const notRun = firmBlock({ size: SIZE }, walk(696.30, 861), ALLOWANCE, false);
  check('a column that was never selected says nothing at all', notRun === '', notRun);

  const degraded = makeFirmBlock(true)({ size: SIZE, firm_balance: null, firm_threshold: null },
                                       walk(696.30, 861), ALLOWANCE, false);
  check('and neither does a page that fell back to the older select',
        degraded === '', degraded);
}

// ------------------------------- has the floor stopped trailing

/* TWO READINGS ANSWER WHAT ONE CANNOT, AND ONLY UNDER ONE CONDITION.
 *
 * A trailing threshold follows the high-water mark, so a pair of readings says
 * whether it is still following - but only across a NEW HIGH. A threshold does
 * not move while an account is falling, and it does not move while an account
 * is recovering ground it has already covered. Both of those look exactly like
 * a lock, and calling either one a lock invents room on an account that has
 * none - the same failure, in the same direction, as the evaluation lock that
 * was seeded from a published rule in August and overstated the room by $1,891.
 *
 * So the high to beat is the highest balance in EVERY earlier reading, not the
 * one immediately before. That is the whole reason this is worth a probe.
 */
const lockEvidence = (rows) => new Function(
  'readings', 'account',
  grab(props, 'function readingsFor(') + '\n' +
  grab(props, 'function lockEvidence(') + '; return lockEvidence(account);')(
    rows.map((r) => ({ account: 'A', ...r })), 'A');

const read = (seen_on, balance, threshold) => ({ seen_on, balance, threshold });

{
  const ev = lockEvidence([
    read('2026-09-25', 250696.30, 244361),
    read('2026-09-28', 251500.00, 245164.70)
  ]);
  check('a new high with the threshold following is still trailing',
        ev && ev.trailing, ev);
  check('and the climb is reported', ev && Math.abs(ev.climbed - 803.70) < 0.01, ev && ev.climbed);
}

{
  const ev = lockEvidence([
    read('2026-09-25', 250696.30, 244361),
    read('2026-09-28', 251500.00, 244361)
  ]);
  check('a new high the threshold ignored is a lock', ev && !ev.trailing, ev);
  check('and the lock is the later threshold',
        ev && Number(ev.to.threshold) === 244361);
}

{
  // The one that matters. Down, then back up but not past the old high: the
  // threshold correctly does not move, and that is NOT a lock.
  const ev = lockEvidence([
    read('2026-09-25', 250696.30, 244361),
    read('2026-09-26', 249000.00, 244361),
    read('2026-09-28', 250500.00, 244361)
  ]);
  check('a recovery short of the old high says nothing', ev === null, ev);
}

{
  // ...and past it, it does.
  const ev = lockEvidence([
    read('2026-09-25', 250696.30, 244361),
    read('2026-09-26', 249000.00, 244361),
    read('2026-09-28', 251000.00, 244361)
  ]);
  check('a recovery that clears the old high does say something', ev !== null, ev);
  check('measured from the old high, not from the dip',
        ev && Math.abs(ev.climbed - (251000 - 250696.30)) < 0.01, ev && ev.climbed);
}

{
  check('one reading is not evidence', lockEvidence([read('2026-09-25', 250696.30, 244361)]) === null);
  check('no readings at all is not evidence', lockEvidence([]) === null);

  // A falling account never moves its threshold. Reading that as a lock is the
  // expensive direction to be wrong in.
  check('a falling account says nothing', lockEvidence([
    read('2026-09-25', 250696.30, 244361),
    read('2026-09-28', 249000.00, 244361)
  ]) === null);

  // Half a reading cannot be compared with anything.
  check('a reading missing its threshold is skipped', lockEvidence([
    read('2026-09-25', 250696.30, 244361),
    { seen_on: '2026-09-26', balance: 251000 },
    read('2026-09-28', 251500.00, 245164.70)
  ]) !== null);
}

{
  // A threshold can trail for months and then lock, so the LAST qualifying
  // pair is the answer - not the first one found.
  const ev = lockEvidence([
    read('2026-09-01', 250000, 243500),
    read('2026-09-10', 251000, 244500),
    read('2026-09-20', 252000, 244500)
  ]);
  check('a later lock beats an earlier trail', ev && !ev.trailing, ev);
  check('and names the pair it read it from',
        ev && ev.from.seen_on === '2026-09-10' && ev.to.seen_on === '2026-09-20', ev);
}

{
  // Readings entered out of order are sorted by the day they describe, not by
  // the order somebody happened to type them.
  const ev = lockEvidence([
    read('2026-09-28', 251500.00, 245164.70),
    read('2026-09-25', 250696.30, 244361)
  ]);
  check('order typed in does not matter', ev && ev.trailing && ev.to.seen_on === '2026-09-28', ev);
}

// ------------------------------- reading the table off the clipboard

/* THE REAL TABLE, 29 SEPTEMBER 2026.
 *
 * Nineteen funded accounts after a bad day. Three rows of it here, with the
 * columns in the order the dashboard showed them and the blank Daily Loss
 * Limit and Cool Down cells left in, because those are what a real paste
 * contains and a parser that only handles a tidy one is not a parser.
 *
 * Every figure in that table is a dollar amount in the same range, which is
 * why the columns are matched by NAME. A Max Balance written into `threshold`
 * produces a room figure wrong by the size of the account and looks entirely
 * reasonable doing it.
 */
const parseReadingTable = new Function(
  props.match(/const READING_HEADERS = \{[\s\S]*?\n\};/)[0] + '\n' +
  props.match(/const normHeader = [\s\S]*?\n[^\n]*\.trim\(\);/)[0] + '\n' +
  grab(props, 'function readingNumber(') + '\n' +
  grab(props, 'function splitRow(') + '\n' +
  grab(props, 'function parseReadingTable(') +
  '; return parseReadingTable;')();

const TAB = '\t';
const HEAD = ['Display Name', 'Balance', 'Max Balance', 'Net Liquidity',
              'Liquidation Threshold', 'Daily Loss Limit', 'Cool Down Period',
              'Dist Drawdown', 'Realized PnL', 'Unrealized PnL', 'Total PnL'].join(TAB);

const REAL = [
  ['PA-APEX-26922-74', '$246,213.51', '$252,247.60', '$246,213.51', '$245,747.60',
   '', '-', '$465.91', '-$3,786.49', '$0.00', '-$3,786.49'],
  ['PA-APEX-26922-75', '$246,183.11', '$252,215.70', '$246,183.11', '$245,715.70',
   '', '-', '$467.41', '-$3,816.89', '$0.00', '-$3,816.89'],
  ['PA-APEX-26922-76', '$246,225.11', '$252,255.70', '$246,225.11', '$245,755.70',
   '', '-', '$469.41', '-$3,774.89', '$0.00', '-$3,774.89']
].map((r) => r.join(TAB));

const NAMES = ['PA-APEX-26922-74', 'PA-APEX-26922-75', 'PA-APEX-26922-76'];

{
  const out = parseReadingTable([HEAD, ...REAL].join('\n'), NAMES);

  check('the real table reads', !out.error && out.rows.length === 3, out.error);
  check('the account name comes off Display Name',
        out.rows[0].account === 'PA-APEX-26922-74', out.rows[0]);
  check('Balance is the account value, not Max Balance',
        out.rows[0].balance === 246213.51, out.rows[0].balance);
  check('the threshold is the liquidation threshold',
        out.rows[0].threshold === 245747.60, out.rows[0].threshold);
  check('and Max Balance lands in its own field',
        out.rows[0].max_balance === 252247.60, out.rows[0].max_balance);

  // The firm's own Dist Drawdown column, reproduced from two others.
  check('room matches the firm\'s Dist Drawdown to the cent',
        Math.abs((out.rows[0].balance - out.rows[0].threshold) - 465.91) < 0.005,
        out.rows[0].balance - out.rows[0].threshold);

  // And the finding the table settles: max less threshold is the full $6,500.
  check('max less threshold is the full allowance, so it is still trailing',
        Math.abs((out.rows[0].max_balance - out.rows[0].threshold) - 6500) < 0.005);

  check('the accounts are recognised as ones this journal knows',
        out.rows.every((r) => r.known));
  check('and nothing was skipped', out.skipped.length === 0, out.skipped);
}

{
  // Columns moved and some hidden. Position tells you nothing; the names do.
  const head = ['Liquidation Threshold', 'Account', 'Max Balance', 'Balance'].join(TAB);
  const row = ['$245,747.60', 'PA-APEX-26922-74', '$252,247.60', '$246,213.51'].join(TAB);
  const out = parseReadingTable([head, row].join('\n'), NAMES);

  check('a reordered table reads the same',
        !out.error && out.rows[0].balance === 246213.51 &&
        out.rows[0].threshold === 245747.60 && out.rows[0].max_balance === 252247.60,
        out.rows && out.rows[0]);
}

{
  // "balance" is inside "max balance". Matching on substrings maps both to one
  // column and the room figure comes out six and a half thousand dollars wrong.
  const head = ['Display Name', 'Max Balance', 'Balance', 'Liquidation Threshold'].join(TAB);
  const row = ['PA-APEX-26922-74', '$252,247.60', '$246,213.51', '$245,747.60'].join(TAB);
  const out = parseReadingTable([head, row].join('\n'), NAMES);

  check('Max Balance before Balance does not capture Balance',
        out.rows[0].balance === 246213.51 && out.rows[0].max_balance === 252247.60,
        out.rows[0]);
}

{
  /* Both Balance and Net Liquidity are in the real table, and they are equal
   * only while nothing is open. Column order must not decide which one a
   * reading means. */
  const head = ['Display Name', 'Net Liquidity', 'Balance', 'Liquidation Threshold'].join(TAB);
  const row = ['PA-APEX-26922-74', '$240,000.00', '$246,213.51', '$245,747.60'].join(TAB);
  const out = parseReadingTable([head, row].join('\n'), NAMES);
  check('Balance beats Net Liquidity wherever it sits',
        out.rows[0].balance === 246213.51, out.rows[0]);
}

{
  const out = parseReadingTable(REAL.join('\n'), NAMES);
  check('a table with no titles is refused, not guessed',
        !!out.error && /header/i.test(out.error), out.error);
}

{
  const head = ['Display Name', 'Balance', 'Total PnL'].join(TAB);
  const out = parseReadingTable([head, ['PA-1', '$1.00', '$2.00'].join(TAB)].join('\n'), []);
  check('a table with no threshold column is refused',
        !!out.error && /threshold/i.test(out.error), out.error);
}

{
  /* Max Balance where the threshold belongs. The row is arithmetically
   * impossible - a threshold above the account value - and dropping it beats
   * drawing a room figure of minus six thousand as though it meant something. */
  const head = ['Display Name', 'Balance', 'Liquidation Threshold'].join(TAB);
  const rows = [['PA-APEX-26922-74', '$246,213.51', '$252,247.60'].join(TAB),
                ['PA-APEX-26922-75', '$246,183.11', '$245,715.70'].join(TAB)];
  const out = parseReadingTable([head, ...rows].join('\n'), NAMES);

  check('a threshold above the account value is dropped',
        out.rows.length === 1 && out.rows[0].account === 'PA-APEX-26922-75', out.rows);
  check('and the dropped row is named', out.skipped.includes('PA-APEX-26922-74'), out.skipped);
}

{
  // A row with a blank figure is left out rather than recorded as a zero.
  const head = ['Display Name', 'Balance', 'Liquidation Threshold'].join(TAB);
  const rows = [['PA-APEX-26922-74', '-', '$245,747.60'].join(TAB),
                ['PA-APEX-26922-75', '$246,183.11', '$245,715.70'].join(TAB)];
  const out = parseReadingTable([head, ...rows].join('\n'), NAMES);
  check('a dash is not a zero', out.rows.length === 1 && out.skipped.length === 1, out);
}

{
  // A toolbar, a title, a selected-rows counter - whatever sits above the
  // table in a real selection.
  const junk = ['Broker Portfolio', 'Show Suspended/Liquidated Accounts', ''];
  const out = parseReadingTable([...junk, HEAD, ...REAL].join('\n'), NAMES);
  check('anything above the header is skipped', !out.error && out.rows.length === 3, out.error);
}

{
  // Columns rendered with spaces instead of tabs.
  const spaced = 'Display Name   Balance      Liquidation Threshold\n' +
                 'PA-APEX-26922-74   $246,213.51   $245,747.60';
  const out = parseReadingTable(spaced, NAMES);
  check('a space-aligned table reads too',
        !out.error && out.rows[0].threshold === 245747.60, out.error || out.rows[0]);
}

{
  const out = parseReadingTable([HEAD, ['PA-NEW-1', '$1,000.00', '$900.00', '', '$800.00']
    .join(TAB)].join('\n'), NAMES);
  check('an account this journal has never seen is read and marked',
        out.rows.length === 1 && out.rows[0].known === false, out.rows);
}

{
  check('nothing pasted says so', !!parseReadingTable('', NAMES).error);
  check('and so does a header with nothing under it',
        !!parseReadingTable(HEAD, NAMES).error);
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
