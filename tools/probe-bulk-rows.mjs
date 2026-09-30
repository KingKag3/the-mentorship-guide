/* APPLYING A FIELD TO SEVERAL ACCOUNTS AT ONCE, INCLUDING ONES THAT DO NOT
 * EXIST YET.
 *
 * On 30 September 2026 nineteen blown funded accounts were marked failed in
 * the Supabase SQL editor and it worked. Four evaluations - APEX-26922-1699
 * and three siblings - were marked failed in the same run and stayed active,
 * and nothing anywhere said so.
 *
 * They had traded for weeks and had never been set up, so there was no
 * `prop_accounts` row to UPDATE. An UPDATE that matches nothing reports
 * success exactly like one that matches everything. The evidence was a count
 * that did not move: 38 finished accounts where 42 were expected.
 *
 * The accounts page cannot make that mistake, for two reasons that are easy to
 * break and were never tested:
 *
 *   1. its account list is every name the JOURNAL has seen as well as every
 *      one configured, so an account that exists only on an imported trade is
 *      in the tick list at all;
 *   2. the write is an UPSERT built from a blank object where there is no
 *      existing row, so ticking one CREATES it.
 *
 * Both are pinned here, because the page being a better tool than the SQL
 * editor rests on them and neither is visible in the code without looking.
 *
 *     node tools/probe-bulk-rows.mjs
 */
import fs from 'node:fs';

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

const bulkRow = new Function(grab(props, 'function bulkRow(') + '; return bulkRow;')();

let bad = 0;
const check = (what, ok, detail) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + what + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
  if (!ok) bad++;
};

const TODAY = '2026-09-30';

// ------------------------------------ an account that has no row at all

{
  /* The case that went wrong. `APEX-26922-1699` has traded all month and has
   * never been configured, so `held` is undefined - which is the shape an
   * UPDATE cannot do anything with and an upsert can. */
  const row = bulkRow('APEX-26922-1699',
                      { status: 'failed', settled_on: TODAY }, 'me', undefined);

  check('an unconfigured account still produces a row', !!row, row);
  check('with the account on it', row.account === 'APEX-26922-1699');
  check('and the owner', row.user_id === 'me');
  check('carrying the status that was asked for', row.status === 'failed', row.status);
  check('and the day it ended', row.settled_on === TODAY, row.settled_on);
  check('and no id, which the database generates', !('id' in row), Object.keys(row));
}

{
  // Nothing in the patch: the row still exists and is still active, which is
  // what an upsert of an untouched account should be.
  const row = bulkRow('NEW-1', {}, 'me', undefined);
  check('a patch of nothing still creates an active row',
        row.status === 'active' && row.account === 'NEW-1', row);
}

// --------------------------------------- an account that already has one

{
  const held = { id: 41, account: 'APEX-26922-1703', kind: 'prop', firm: 'Apex',
                 size: 250000, status: 'active', settled_on: null };
  const row = bulkRow('APEX-26922-1703', { status: 'failed', settled_on: TODAY }, 'me', held);

  check('an existing row keeps what the patch does not mention',
        row.firm === 'Apex' && row.size === 250000, row);
  check('and takes what it does', row.status === 'failed');
  check('the cached id is dropped', !('id' in row), Object.keys(row));
}

{
  /* RE-MARKING MUST NOT MOVE THE DAY IT ENDED. Nineteen accounts marked failed
   * today and marked again next week are still accounts that ended today. */
  const held = { account: 'A', status: 'failed', settled_on: '2026-09-25' };
  const row = bulkRow('A', { status: 'failed', settled_on: TODAY }, 'me', held);
  check('a settled date already recorded is the real one',
        row.settled_on === '2026-09-25', row.settled_on);

  // ...but an account that has none takes today's.
  const fresh = bulkRow('B', { status: 'failed', settled_on: TODAY }, 'me',
                        { account: 'B', status: 'active', settled_on: null });
  check('and an account with none takes the one offered',
        fresh.settled_on === TODAY, fresh.settled_on);
}

{
  // The patch wins over the held row wherever both speak. Anything else and
  // the panel would silently refuse to change a field that was already set.
  const held = { account: 'C', kind: 'prop', drawdown: 6000 };
  const row = bulkRow('C', { kind: 'funded', drawdown: 6500 }, 'me', held);
  check('the patch overrides what is held', row.kind === 'funded' && row.drawdown === 6500, row);
}

{
  // A held row naming a different account cannot rename the one being written.
  // `saved.get(name)` should never return that, but the write is the last place
  // a mix-up could reach the database.
  const row = bulkRow('WANTED', { status: 'failed' }, 'me',
                      { account: 'SOMETHING-ELSE', status: 'active' });
  check('the account written is the one asked for', row.account === 'WANTED', row.account);
}

// ------------------------------------------- the list the panel picks from

{
  /* The other half: an account that only appears on a trade has to be IN the
   * list before it can be ticked. That list is built in the page body rather
   * than in a function, so it is matched here as source. */
  const built = props.match(/const names = \[\.\.\.new Set\(\[[\s\S]*?\]\)\]\.sort\(\);/);
  check('the account list is built at all', !!built);
  check('from the journal as well as the configured accounts',
        !!built && /trades\.map\(\(t\) => t\.account\)/.test(built[0]) &&
        /saved\.keys\(\)/.test(built[0]),
        built && built[0].replace(/\s+/g, ' '));
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
