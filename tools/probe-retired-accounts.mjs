/* WHICH ACCOUNTS ARE FINISHED, and what three pages do about it.
 *
 * A member with nineteen evaluations retires them as they pass. Their trades
 * stay in the journal for ever, so by the end of a year most of the names on
 * the accounts page, the importer's suggestion list and the calendar's filter
 * are accounts nobody trades any more.
 *
 * `retiredAccounts` is the one rule all three ask. This probe pins down what it
 * answers, and in particular the case that broke the first version: an account
 * that passed, was RESET, and is being traded again. Its second attempt says
 * passed and its third says active - it is not retired, and judging it by any
 * attempt other than the latest gets that backwards.
 *
 * It also pins the calendar's scope filter, whose one surprising rule is that
 * asking for an account by name beats the scope.
 *
 *     node tools/probe-retired-accounts.mjs
 */
import fs from 'node:fs';

const src = fs.readFileSync('app.js', 'utf8');
const cal = fs.readFileSync('calendar.html', 'utf8');

const grab = (text, signature) => {
  const at = text.indexOf(signature);
  if (at < 0) throw new Error('not found: ' + signature);

  /* Start counting braces at the BODY, not at the signature. `tradeValue`
   * destructures its argument, so a count that starts at the signature closes
   * on the parameter list and hands back half a function - which then parses
   * as a syntax error a hundred lines away from the cause. */
  let from = at;
  if (signature.includes('function')) {
    let paren = 0;
    for (let i = at; i < text.length; i++) {
      if (text[i] === '(') paren++;
      else if (text[i] === ')') { paren--; if (!paren) { from = text.indexOf('{', i); break; } }
    }
  }

  let depth = 0, started = false;
  for (let i = from; i < text.length; i++) {
    if (text[i] === '{') { depth++; started = true; }
    else if (text[i] === '}') { depth--; if (started && !depth) return text.slice(at, i + 1); }
  }
  throw new Error('unbalanced: ' + signature);
};

const { retiredAccounts } = new Function(
  grab(src, 'export function retiredAccounts(').replace('export ', '') +
  '; return { retiredAccounts };')();

/* The calendar's own filter, lifted out of the page so the probe tests the
 * shipped text rather than a copy of it that can drift. */
const makeInScope = (retired, scope, account) => new Function('retired', 'scope', 'account',
  grab(cal, 'function inScope(') + '; return inScope;')(retired, scope, account);

let bad = 0;
const check = (what, ok, detail) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + what + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
  if (!ok) bad++;
};

// ------------------------------------------------------------ the rule

const has = (set, name) => set.has(name);

{
  // A funded account names where it came from. The firmest evidence there is:
  // another account exists BECAUSE this one passed.
  const out = retiredAccounts([
    { account: 'PA-APEX-26922-74', kind: 'funded', from_account: 'APEX-26922-1672' },
    { account: 'APEX-26922-1672', kind: 'prop', status: 'active' }
  ], []);
  check('a linked evaluation is retired', has(out, 'APEX-26922-1672'));
  check('the funded account it earned is not', !has(out, 'PA-APEX-26922-74'));
}

{
  // Passed with no funded account entered yet. Passed is passed: whether the
  // member has got round to typing the new number is not the firm's business
  // and is not this page's either.
  const out = retiredAccounts([{ account: 'APEX-26922-1673', status: 'passed' }], []);
  check('status passed is enough on its own', has(out, 'APEX-26922-1673'));
}

{
  // Where a pass usually lives. `prop_accounts.status` can still read active
  // while the attempt row says otherwise.
  const out = retiredAccounts(
    [{ account: 'APEX-26922-1674', status: 'active' }],
    [{ account: 'APEX-26922-1674', attempt: 1, outcome: 'failed' },
     { account: 'APEX-26922-1674', attempt: 2, outcome: 'passed' }]);
  check('the latest attempt passing retires it', has(out, 'APEX-26922-1674'));
}

{
  // THE CASE THAT MATTERS. Passed on attempt two, reset, trading again on
  // three. What it is doing NOW is what counts.
  const out = retiredAccounts(
    [{ account: 'APEX-26922-1675', status: 'active' }],
    [{ account: 'APEX-26922-1675', attempt: 2, outcome: 'passed' },
     { account: 'APEX-26922-1675', attempt: 3, outcome: 'active' }]);
  check('passed then reset then traded again is NOT retired', !has(out, 'APEX-26922-1675'));
}

{
  // Attempts arriving newest-first must not change the answer.
  const rows = [{ account: 'X', attempt: 3, outcome: 'active' },
                { account: 'X', attempt: 2, outcome: 'passed' }];
  check('attempt order does not matter', !has(retiredAccounts([], rows), 'X'));
}

{
  // A project that has not run the attempts migration gets undefined here, not
  // an empty array. That is not an error - it simply has no attempts.
  const out = retiredAccounts([{ account: 'A', status: 'passed' }], undefined);
  check('no attempts table is not an error', has(out, 'A') && out.size === 1);
  check('no arguments at all is empty', retiredAccounts().size === 0);
}

{
  const out = retiredAccounts([{ account: 'B', status: 'failed' }],
                              [{ account: 'B', attempt: 1, outcome: 'failed' }]);
  check('a failed account is not retired', !has(out, 'B'), [...out]);
}

// ------------------------------------------- what the calendar does with it

{
  const retired = new Set(['APEX-26922-1672']);

  const active = makeInScope(retired, 'active', 'all');
  check('active scope drops a retired account', !active('APEX-26922-1672'));
  check('active scope keeps a live one', active('APEX-26922-1679'));

  const only = makeInScope(retired, 'retired', 'all');
  check('passed scope keeps the retired one', only('APEX-26922-1672'));
  check('passed scope drops the live one', !only('APEX-26922-1679'));

  const all = makeInScope(retired, 'all', 'all');
  check('everything scope keeps both',
        all('APEX-26922-1672') && all('APEX-26922-1679'));

  // Picking a retired account by name and being shown an empty month would be
  // the page arguing with what was just asked for.
  const named = makeInScope(retired, 'active', 'APEX-26922-1672');
  check('a named account beats the scope', named('APEX-26922-1672'));

  // A trade with no account recorded is not retired, and belongs in the
  // default view rather than nowhere.
  check('a blank account name is in the active scope', active(''));
  check('a blank account name is in no undefined hole', active(undefined));
}

// ------------------------------------- what the summary SAYS is missing

/* THE SENTENCE ITSELF, built from the shipped code.
 *
 * Hiding a passed account changes what a month appears to be worth, and a
 * September that quietly shrinks because an account passed in September is the
 * page rewriting history to look tidy. The note is the whole defence against
 * that, so its arithmetic and its wording are worth pinning down rather than
 * eyeballing once and trusting for ever. */
const summaryNote = ({ trades, retired, scope, account = 'all', metric = 'dollars',
                       month = '2026-09' }) => {
  const [y, m] = month.split('-').map(Number);
  const parts = [
    grab(src, 'export const CONTRACTS = '),
    grab(src, 'export function contractFor('),
    grab(src, 'export function toNumber('),
    grab(src, 'export function tradeValue('),
    grab(src, 'export function money('),
    src.match(/const DECISION_WINDOW_MS = [^;]+;/)[0],
    src.match(/const sameNumber = [\s\S]*?\n};/)[0],
    grab(src, 'export function decisionKey('),
    grab(src, 'export function distinctDecisions('),
    grab(cal, 'function dayTotals('),
    grab(cal, 'function dayValue('),
    grab(cal, 'function fmt('),
    grab(cal, 'function inScope('),
    grab(cal, 'function hiddenByScope('),
    grab(cal, 'function scopeNote(')
  ].join('\n\n').replace(/export /g, '');

  return new Function('closed', 'retired', 'scope', 'account', 'metric', 'cursor',
                      'hasRetired',
                      parts + '; return scopeNote();')(
    trades, retired, scope, account, metric, new Date(y, m - 1, 1), true);
};

{
  /* One decision copied into three accounts, two of which have passed. The
   * copies are the point: the note has to say ONE decision, not two. */
  const fill = (account, seconds) => ({
    account, opened_at: '2026-09-17T13:31:' + seconds + '+00:00',
    symbol: 'NQ', direction: 'short', contracts: '1',
    entry: '29704.25', exit_price: '29659', net_pnl: '500'
  });
  const trades = [fill('APEX-26922-1672', 20), fill('APEX-26922-1673', 21),
                  fill('APEX-26922-1679', 21)];
  const retired = new Set(['APEX-26922-1672', 'APEX-26922-1673']);

  const note = summaryNote({ trades, retired, scope: 'active' });
  check('the note names how many accounts are out',
        note.includes('2 accounts passed and retired'), note);
  check('and collapses the copies to one decision', note.includes('1 decision'), note);
  check('and gives what they made', note.includes('$1,000'), note);
  check('and offers the whole picture', note.includes('data-scope="all"'));

  check('nothing is said when everything is counted already',
        summaryNote({ trades, retired, scope: 'all' }) === '');
  check('nothing is said when one account was asked for by name',
        summaryNote({ trades, retired, scope: 'active', account: 'APEX-26922-1672' }) === '');
  check('nothing is said about a month with nothing hidden in it',
        summaryNote({ trades, retired, scope: 'active', month: '2026-08' }) === '');

  const flipped = summaryNote({ trades, retired, scope: 'retired' });
  check('the passed tab reports the live account instead',
        flipped.includes('1 account still being traded'), flipped);

  // Singular and plural are both written out; neither should read as the other.
  const one = summaryNote({ trades: [fill('APEX-26922-1672', 20)],
                            retired: new Set(['APEX-26922-1672']), scope: 'active' });
  check('one account reads as one account',
        one.includes('1 account passed and retired is not counted'), one);
}

{
  // A month with no dollar figures anywhere must not claim a total of zero.
  const trades = [{ account: 'X', opened_at: '2026-09-02T14:00:00+00:00',
                    symbol: 'YM', direction: 'long', contracts: '1' }];
  const note = summaryNote({ trades, retired: new Set(['X']), scope: 'active' });
  check('an unpriced month gives the count without inventing a total',
        note.includes('1 decision this month') && !note.includes('worth'), note);
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
