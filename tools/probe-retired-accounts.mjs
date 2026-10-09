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
  src.match(/const FINISHED = [^;]+;/)[0] + '\n' +
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
  /* FAILED IS FINISHED TOO, since 30 September 2026.
   *
   * It was not, and the reasoning was about a failed evaluation being reset.
   * That case is handled below by the latest attempt; leaving every failed
   * account out of the rule meant nineteen blown funded accounts stayed on the
   * importer's list and in the statistics, which is the page describing
   * trading nobody can do any more. */
  const out = retiredAccounts([{ account: 'B', status: 'failed' }],
                              [{ account: 'B', attempt: 1, outcome: 'failed' }]);
  check('a failed account is finished', has(out, 'B'), [...out]);

  check('status alone is enough when there are no attempts',
        has(retiredAccounts([{ account: 'C', status: 'failed' }], []), 'C'));

  check('and so is a failed latest attempt over an active status',
        has(retiredAccounts([{ account: 'D', status: 'active' }],
                            [{ account: 'D', attempt: 2, outcome: 'failed' }]), 'D'));
}

{
  /* THE CASE THE OLD RULE WAS PROTECTING, done properly.
   *
   * Failed on attempt two, reset, trading again on three. The status column is
   * stale; the attempt is not. */
  const out = retiredAccounts(
    [{ account: 'E', status: 'failed' }],
    [{ account: 'E', attempt: 2, outcome: 'failed' },
     { account: 'E', attempt: 3, outcome: 'active' }]);
  check('failed then reset then traded again is NOT finished', !has(out, 'E'), [...out]);
}

{
  /* ...but a funded account existing is not undone by anything. The evaluation
   * behind it is over whatever its own rows say. */
  const out = retiredAccounts(
    [{ account: 'PA-1', kind: 'funded', from_account: 'EVAL-1' },
     { account: 'EVAL-1', status: 'active' }],
    [{ account: 'EVAL-1', attempt: 4, outcome: 'active' }]);
  check('a linked evaluation stays finished even with a live attempt',
        has(out, 'EVAL-1'), [...out]);
}

{
  // `retired` is in the enum and nothing sets it yet. Leaving it out would
  // make the first thing that does silently wrong.
  check('a retired status counts',
        has(retiredAccounts([{ account: 'F', status: 'retired' }], []), 'F'));
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

  /* A NAMED ACCOUNT NO LONGER BEATS THE SCOPE, AND MUST NOT.
   *
   * It did, because the filter offered every account that had ever traded
   * whatever the tab said - so picking a finished one under Still trading and
   * being shown an empty month would have been the page arguing with the
   * request.
   *
   * The filter is built from this function now, so an out-of-scope account
   * cannot be chosen at all. An exception for choosing one would only ever
   * fire on a stale value left in the select, and would then silently ignore
   * the tab - which is the failure the exception was written to prevent,
   * pointing the other way. */
  const named = makeInScope(retired, 'active', 'APEX-26922-1672');
  check('the scope holds even with that account named', !named('APEX-26922-1672'));

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
    grab(src, 'export function rootSymbol('),
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
        note.includes('2 finished accounts are not counted'), note);
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
        one.includes('1 finished account is not counted'), one);
}

{
  // A month with no dollar figures anywhere must not claim a total of zero.
  const trades = [{ account: 'X', opened_at: '2026-09-02T14:00:00+00:00',
                    symbol: 'YM', direction: 'long', contracts: '1' }];
  const note = summaryNote({ trades, retired: new Set(['X']), scope: 'active' });
  check('an unpriced month gives the count without inventing a total',
        note.includes('1 decision this month') && !note.includes('worth'), note);
}

// ------------------------------------- the list the control offers

/* THE TAB PICKS THE PILE; THE LIST NARROWS WITHIN IT.
 *
 * Forty-two accounts finished in a fortnight and the filter went on offering
 * all of them, unchanged, while the tabs above it moved - so the tabs read as
 * a filter on the page rather than on the list, which is backwards. */
const accountsInScope = (all, retired, scope) => new Function(
  'accounts', 'retired', 'scope', 'account',
  grab(cal, 'function inScope(') + '\n' +
  grab(cal, 'function accountsInScope(') + '; return accountsInScope();')(
    all, retired, scope, 'all');

{
  const all = ['APEX-1672', 'APEX-1673', 'APEX-1679', 'APEX-1680'];
  const retired = new Set(['APEX-1672', 'APEX-1673']);

  check('still trading offers only the live ones',
        accountsInScope(all, retired, 'active').join() === 'APEX-1679,APEX-1680',
        accountsInScope(all, retired, 'active'));

  check('finished offers only the finished ones',
        accountsInScope(all, retired, 'retired').join() === 'APEX-1672,APEX-1673',
        accountsInScope(all, retired, 'retired'));

  check('everything offers everything',
        accountsInScope(all, retired, 'all').length === 4);

  // A pile with nothing in it offers nothing rather than falling back to all.
  check('an empty pile is empty',
        accountsInScope(['APEX-1679'], new Set(), 'retired').length === 0);
}

// ------------------------- what an account is, and when nobody has said

/* A MISSING TAG MUST MEAN ONE THING.
 *
 * These drew only the three kinds that are not the default at first, on the
 * argument that tagging every evaluation would bury the one tag worth seeing.
 * That made a blank mean two things at once - "this is an evaluation" and
 * "nobody has ever said what this is" - and the second is the one that lets an
 * account sit for weeks carrying a target it can never meet.
 *
 * So every recorded kind draws, and nothing recorded draws nothing. The
 * failure mode this guards is a caller passing `kind || 'prop'`, which throws
 * the distinction away before the tag ever sees it and looks entirely
 * reasonable in a diff.
 */
const { kindTag, kindWord } = new Function(
  grab(src, 'export function escapeHtml(').replace('export ', '') + '\n' +
  src.match(/const KIND_TONE = [^;]+;/)[0] + '\n' +
  src.match(/const KIND_WHY = \{[\s\S]*?\n\};/)[0] + '\n' +
  grab(src, 'export function kindTag(').replace('export ', '') + '\n' +
  grab(src, 'export function kindWord(').replace('export ', '') +
  '; return { kindTag, kindWord };')();

const tagWord = (kind) => (kindTag(kind).match(/>([^<]*)</) || [, ''])[1];

{
  for (const kind of ['prop', 'funded', 'live', 'demo']) {
    check('"' + kind + '" is named', tagWord(kind) === kind, kindTag(kind));
    check('  and in plain text too', kindWord(kind) === ' — ' + kind, kindWord(kind));
  }
}

{
  // The whole point. None of these is an evaluation; they are an absence.
  for (const nothing of [undefined, null, '']) {
    check('nothing recorded draws nothing (' + JSON.stringify(nothing) + ')',
          kindTag(nothing) === '' && kindWord(nothing) === '', kindTag(nothing));
  }

  check('and so does a kind nobody has heard of', kindTag('junk') === '', kindTag('junk'));
}

{
  // Every kind gets its own colour or none, and live must not share with an
  // evaluation - they are the two a reader most needs to tell apart at a
  // glance on a list where one row is money and the rest are a test.
  const tone = (k) => (kindTag(k).match(/class="tag ?([a-z]*)"/) || [, ''])[1];
  check('live and prop do not share a tone', tone('live') !== tone('prop'),
        [tone('live'), tone('prop')]);
  check('nor do funded and prop', tone('funded') !== tone('prop'),
        [tone('funded'), tone('prop')]);
}

{
  /* The pages that draw it keep two functions on purpose: a defaulted one for
   * the arithmetic, which is right, and a raw one for the tag. A page that
   * lost the raw one would silently start claiming every unconfigured account
   * is an evaluation, and nothing else would change. */
  for (const [page, text] of [['calendar.html', cal], ['stats.html', fs.readFileSync('stats.html', 'utf8')]]) {
    check(page + ' keeps a raw reader beside the defaulted one',
          /const recordedKind = /.test(text) && /const kindOf = /.test(text));
    check(page + ' draws from the raw one, never the default',
          !/kind(Tag|Word)\(kindOf\(/.test(text),
          (text.match(/kind(?:Tag|Word)\(kindOf\([^)]*\)/g) || []).slice(0, 3));
  }
}

// ----------------------------------- paused is not a kind of finished

/* THE WHOLE POINT OF THE STATE.
 *
 * `passed`, `failed` and `retired` are final: the account is done, the trading
 * has moved somewhere else, and this site greys the card, drops the name from
 * the importer and takes it out of the default view.
 *
 * A live margin account with $99 in it is none of those. It has not passed, has
 * not been blown, has not been closed - it simply cannot open a position,
 * because a Micro Nasdaq needs $100 intraday, and it is one deposit from being
 * real again.
 *
 * Folding it in with the final three would make the Finished pile mean two
 * incompatible things - "this is over" and "this is waiting" - which is the
 * same mistake the kind tags made on 30 September, where a blank meant both
 * "evaluation" and "nobody has said". A label that means two things tells you
 * neither.
 *
 * So it is asserted here, pointing the opposite way to every other check in
 * this file, because `paused` sitting in a list beside four finals is exactly
 * the thing somebody tidies up later. */
{
  check('a paused account is NOT finished',
        !has(retiredAccounts([{ account: 'LIVE-1', kind: 'live', status: 'paused' }], []), 'LIVE-1'));

  check('and a paused latest attempt does not finish one either',
        !has(retiredAccounts([{ account: 'E-1', status: 'active' }],
                             [{ account: 'E-1', attempt: 2, outcome: 'paused' }]), 'E-1'));

  // ...and a pause does not rescue one that IS finished by other evidence.
  check('a funded account still retires the evaluation behind it',
        has(retiredAccounts([{ account: 'PA-9', kind: 'funded', from_account: 'E-9' },
                             { account: 'E-9', status: 'paused' }], []), 'E-9'));
}

{
  /* It has to be in the enum the database accepts, or saving it fails with a
   * constraint violation that reads as a bug in the page. */
  const sql = fs.readFileSync('supabase/account-paused.sql', 'utf8');
  check('the migration widens the status constraint',
        /check \(status in \([^)]*'paused'[^)]*\)\)/.test(sql), (sql.match(/check \(status in [^;]+/) || [''])[0]);

  const props = fs.readFileSync('props.html', 'utf8');
  check('the card offers it on a watched account',
        /'active', 'paused', 'passed', 'failed', 'retired'/.test(props));
  check('and on a live or demo one, which cannot pass or fail',
        /'active', 'paused', 'retired'/.test(props));
  check('the bulk panel offers it too', /value="paused"/.test(props));

  check('a pause earns no settled date, because it is not an ending',
        /status !== 'active' && .*status !== 'paused'/.test(props) ||
        /!== 'active' && row\.status !== 'paused'/.test(props));

  check('and a non-active status shows on a live account, not only a prop one',
        /outcome && outcome !== 'active'/.test(props));
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
