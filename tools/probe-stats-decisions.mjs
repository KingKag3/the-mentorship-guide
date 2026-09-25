/* WHAT THE STATISTICS PAGE COUNTS, NOW THAT THE JOURNAL IS FULL OF COPIES.
 *
 * Nineteen accounts running a copier turn one fill into nineteen rows. The
 * money is real nineteen times over; the EVIDENCE is not, and the statistics
 * page was reading its sample size off the rows. Everything that exists to stop
 * a member trusting a thin slice - "a usable sample", the too-few warning, the
 * `thin` tag on every breakdown - was being answered with a number nineteen
 * times too big. A confident page over three decisions.
 *
 * Two claims are pinned here, because both are easy to quietly get backwards
 * again the next time this code is touched:
 *
 *   1. `n`, wins and losses are DECISIONS. Dollars pool across the copies,
 *      because they really did land in every account. R does not, because R
 *      measures the decision and nineteen copies of +2R is not +38R.
 *
 *   2. Drawdown is PER ACCOUNT. A firm fails an account on its own peak to
 *      trough against its own threshold, so one curve over the pooled rows -
 *      which is what this page drew - is a number no account ever saw.
 *
 *     node tools/probe-stats-decisions.mjs
 */
import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');
const stats = fs.readFileSync('stats.html', 'utf8');
const analytics = fs.readFileSync('analytics.js', 'utf8');

const grab = (text, signature) => {
  const at = text.indexOf(signature);
  if (at < 0) throw new Error('not found: ' + signature);

  // Start counting at the body, not at a destructured parameter list.
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

const { distinctDecisions } = new Function(
  app.match(/const DECISION_WINDOW_MS = [^;]+;/)[0] + '\n' +
  app.match(/const sameNumber = [\s\S]*?\n};/)[0] + '\n' +
  grab(app, 'export function decisionKey(').replace('export ', '') + '\n' +
  grab(app, 'export function distinctDecisions(').replace('export ', '') +
  '; return { distinctDecisions };')();

const { groupBy, drawdown } = new Function(
  grab(analytics, 'export function groupBy(').replace('export ', '') + '\n' +
  grab(analytics, 'export function drawdown(').replace('export ', '') +
  '; return { groupBy, drawdown };')();

/* The page's own functions, lifted out of the shipped file. Their dependencies
 * are handed in rather than rebuilt, so this tests the arithmetic that ships
 * and not a copy of it that can drift. */
const make = (signature) => new Function(
  'UNIT', 'unit', 'decisions', 'groupBy', 'drawdownWith', 'firmLimit',
  grab(stats, signature) + '; return ' + signature.match(/function (\w+)/)[1] + ';');

const summariseIn = make('function summariseIn(')(
  { r: { value: (r) => Number(r.r), pools: false },
    money: { value: (r) => Number(r.net_pnl), pools: true } },
  null, distinctDecisions, groupBy, drawdown, new Map());

let bad = 0;
const check = (what, ok, detail) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + what + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
  if (!ok) bad++;
};

/* Two decisions, copied. The winner is in all three accounts; the loser was
 * only taken in two, which is what a copier that was switched on late looks
 * like - and it is why a win rate off the rows is not the win rate. */
const fill = (account, seconds, net, r) => ({
  account, opened_at: '2026-09-17T13:31:' + seconds + '+00:00',
  symbol: 'NQ', direction: 'short', contracts: '1',
  entry: '29704.25', exit_price: '29659', net_pnl: String(net), r: String(r)
});
const loss = (account, seconds) => ({
  account, opened_at: '2026-09-17T15:02:' + seconds + '+00:00',
  symbol: 'NQ', direction: 'long', contracts: '1',
  entry: '29700', exit_price: '29680', net_pnl: '-400', r: '-1'
});

const list = [
  fill('A', '20', 500, 2), fill('B', '21', 500, 2), fill('C', '21', 500, 2),
  loss('A', '10'), loss('B', '11')
];

{
  const s = summariseIn(list, 'money');
  check('five rows are two decisions', s.n === 2, { n: s.n, rows: s.rows });
  check('rows are still reported', s.rows === 5);
  check('one won and one lost', s.wins === 1 && s.losses === 1, [s.wins, s.losses]);
  check('a win rate off decisions, not off copiers', Math.round(s.winRate) === 50, s.winRate);
  check('dollars pool across every account', s.total === 1500 - 800, s.total);
  check('expectancy is per decision', s.avg === 350, s.avg);
}

{
  // The same journal in R. Three copies of +2R is +2R of judgement; summing it
  // would mean switching on a fourth copier improved the trading.
  const s = summariseIn(list, 'r');
  check('R collapses instead of pooling', s.total === 1, s.total);
  check('and its n is the same two decisions', s.n === 2);
}

{
  // The case the page got wrong out loud: a model tried once, in nineteen
  // accounts, must not read as nineteen trades' worth of evidence.
  const once = [];
  for (let i = 0; i < 19; i++) once.push(fill('ACC-' + i, i < 5 ? '20' : '21', 500, 2));
  const s = summariseIn(once, 'money');
  check('nineteen copies of one trade are n=1', s.n === 1, { n: s.n, rows: s.rows });
  check('and are still worth all nineteen lots of money', s.total === 9500, s.total);
}

{
  const s = summariseIn([], 'money');
  check('an empty list does not divide by zero',
        s.n === 0 && s.total === 0 && s.avg === 0 && s.winRate === 0);
}

// ------------------------------------------------------- drawdown per account

const accountDrawdowns = (rows, limits) => make('function accountDrawdowns(')(
  { money: { value: (r) => Number(r.net_pnl) } },
  'money', distinctDecisions, groupBy, drawdown, limits)(rows);

{
  /* Two accounts trading the same decisions. Each one's curve goes +500 then
   * -400, so each one's worst peak to trough is 400. Pooled, it is 800 - a
   * number neither account ever saw, and the one this page used to print. */
  const limits = new Map([['A', { drawdown: 2500, type: 'trailing', kind: 'prop' }]]);
  const out = accountDrawdowns(list.filter((r) => r.account !== 'C'), limits);

  check('one curve per account', out.length === 2, out.map((a) => a.name));
  check('each account sees its own depth, not the pool',
        out.every((a) => a.depth === 400), out.map((a) => a.depth));
  check('the worst account is first', out[0].depth >= out[1].depth);
  check('the threshold comes from the account, where one is set',
        out.find((a) => a.name === 'A').limit === 2500);
  check('and is null where none is', out.find((a) => a.name === 'B').limit === null);
}

{
  // An account that only ever went up has no drawdown, and must not be given
  // one by a curve that starts at zero.
  const up = [fill('A', '20', 500, 2), { ...fill('A', '30', 300, 1) }];
  check('an account that never drew down reports nothing',
        accountDrawdowns(up, new Map())[0].depth === 0);
}

// ------------------------------------------ what it says about the threshold

/* THE TABLE A MEMBER READS BEFORE DECIDING THEY HAVE ROOM.
 *
 * It is built from closed trades, and a trailing threshold follows the account
 * while a position is open, so the real low point was at least this deep. A
 * number that gets somebody comfortable is worse than no number, so the caveat
 * is part of the block rather than a thing somebody remembers to add. */
const { escapeHtml, money } = new Function(
  grab(app, 'export function escapeHtml(').replace('export ', '') + '\n' +
  grab(app, 'export function money(').replace('export ', '') +
  '; return { escapeHtml, money };')();

const limitBlock = (rows, limits, unit = 'money', hide = false) => new Function(
  'UNIT', 'unit', 'decisions', 'groupBy', 'drawdownWith', 'firmLimit', 'escapeHtml',
  'money', 'label',
  grab(stats, 'function accountDrawdowns(') + '\n' +
  grab(stats, 'function limitBlock(') + '; return limitBlock;')(
    { money: { value: (r) => Number(r.net_pnl) }, r: { value: (r) => Number(r.r) } },
    unit, distinctDecisions, groupBy, drawdown, limits, escapeHtml, money,
    (n) => (hide ? 'Account ' + n : n))(rows);

{
  const limits = new Map([['A', { drawdown: 2500, type: 'trailing', kind: 'prop' }]]);
  const html = limitBlock(list.filter((r) => r.account !== 'C'), limits);

  check('the account with a threshold is in the table', html.includes('>A</td>'));
  check('the one without a threshold is left out', !html.includes('>B</td>'));
  check('it shows the depth as a loss', html.includes('-$400'));
  check('and what is left of the allowance', html.includes('$2,100'));
  check('it names the kind of threshold', html.includes('trailing'));
  check('it says closed trades are a floor', html.includes('floor'));
  check('and why a trailing one is worse than it looks',
        html.includes('while a position is open'));

  // The privacy toggle has to reach this table too: an account number is the
  // account, and a screenshot of it is the thing being protected against.
  const hidden = limitBlock(list.filter((r) => r.account !== 'C'), limits, 'money', true);
  check('the alias is used when numbers are hidden',
        hidden.includes('Account A') && !hidden.includes('>A</td>'));
}

{
  // Nothing to say beats saying it emptily.
  check('no thresholds set means no table',
        limitBlock(list, new Map()) === '');
  check('R is not held up against a dollar threshold',
        limitBlock(list, new Map([['A', { drawdown: 2500, type: 'trailing' }]]), 'r') === '');
}

{
  // A quarter of the allowance left is the point at which somebody should be
  // told rather than left to do the subtraction.
  const tight = new Map([['A', { drawdown: 500, type: 'static' }]]);
  const html = limitBlock(list.filter((r) => r.account === 'A'), tight);
  check('a thin buffer is marked', html.includes('thin'), html.includes('thin'));
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
