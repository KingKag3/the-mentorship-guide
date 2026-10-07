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

// ------------------------------------------- one option per size, not per row

/* THE DROPDOWN LISTED PRESET ROWS, AND THERE IS NO LONGER ONE PER SIZE.
 *
 * That was right while `prop_presets` held a row per size. The product column
 * added a row per PRODUCT per size, so Apex's four ladders put "$25,000.00" on
 * screen three times, "$100,000.00" four times and "$250,000.00" twice -
 * identical options with nothing to tell them apart, three of the four doing
 * exactly what the first one does.
 *
 * Which product it is has its own control two fields away, and the pair is
 * what looks a ladder up. So the size list is the sizes that exist, each once.
 */
const app = fs.readFileSync('app.js', 'utf8');

const money = new Function(
  grab(app, 'export function money(').replace('export ', '') + '; return money;')();

const sizes = (rows) => new Function('presets', 'money',
  props.match(/const PRESET_SIZES = [\s\S]*?\.sort\(\(a, b\) => a - b\);/)[0] + '\n' +
  grab(props, 'function sizeOptions(') +
  '; return { PRESET_SIZES, sizeOptions };')(rows, money);

{
  // The real seeded shape: four products, sizes shared between them, and the
  // rows arriving from two migrations rather than one ordered query.
  const seeded = [
    { size: 250000 }, { size: 25000 }, { size: 25000 }, { size: 100000 },
    { size: 100000 }, { size: 100000 }, { size: 100000 }, { size: 25000 },
    { size: 50000 }, { size: 50000 }, { size: 250000 }, { size: 75000 }
  ];
  const api = sizes(seeded);

  check('twelve rows become five sizes', api.PRESET_SIZES.length === 5, api.PRESET_SIZES);
  check('and they are in order, not in row order',
        api.PRESET_SIZES.join() === '25000,50000,75000,100000,250000', api.PRESET_SIZES);

  const html = api.sizeOptions(100000);
  check('each size appears exactly once',
        (html.match(/\$100,000\.00/g) || []).length === 1,
        (html.match(/\$100,000\.00/g) || []).length);
  check('the chosen one is marked', /value="100000" selected/.test(html));
  check('and only that one is', (html.match(/ selected/g) || []).length === 1);
}

{
  // A row with no size is not a size. `Number('')` is 0 and `Number(null)` is
  // 0 as well, which is the hole this project keeps finding.
  const api = sizes([{ size: 50000 }, { size: '' }, { size: null }, { size: 0 }]);
  check('a blank size is not offered as an option',
        api.PRESET_SIZES.join() === '50000', api.PRESET_SIZES);
}

{
  const api = sizes([]);
  check('no presets at all offers nothing rather than throwing',
        api.PRESET_SIZES.length === 0 && api.sizeOptions(null) === '');
}

{
  // A size the member typed that is not on any ladder must not be silently
  // selected as something else.
  const api = sizes([{ size: 50000 }, { size: 100000 }]);
  const html = api.sizeOptions(66000);
  check('a size off the ladder marks nothing', !/ selected/.test(html), html);
}

{
  // Both selects go through the one builder, so they cannot drift apart.
  check('the card and the bulk panel share the builder',
        (props.match(/sizeOptions\(/g) || []).length >= 3,
        (props.match(/sizeOptions\(/g) || []).length);
  check('and neither still maps the preset rows',
        !/presets\.map\(\(x\) => '<option value="' \+ x\.size/.test(props));
}

// ------------------------------------------- the piles on the accounts page

/* FOUR TABS THAT PARTITION, AND ONE THAT OVERLAPS.
 *
 * Funded, Evaluations, Finished and Live-and-demo hold each account exactly
 * once. `trading` holds every account that is not finished, whatever kind it
 * is, so the same account appears there AND in its own pile.
 *
 * That is deliberate and it is the thing most likely to be "corrected" later
 * by somebody noticing the counts along the top sum to more than the number of
 * accounts. So both halves are asserted: that the four still partition, and
 * that `trading` deliberately does not.
 */
const groupOf = (name, passed, finished, saved) => new Function(
  'name', 'passed', 'finished', 'saved',
  grab(props, 'function groupOf(') + '; return groupOf(name, passed);')(
    name, passed, finished, saved);

{
  const saved = new Map([
    ['PA-1', { kind: 'funded' }],
    ['EVAL-1', { kind: 'prop' }],
    ['EVAL-2', { kind: 'prop' }],
    ['LIVE-1', { kind: 'live' }],
    ['DEMO-1', { kind: 'demo' }]
  ]);
  const finished = new Set(['EVAL-2']);
  const passed = new Map();

  const pile = (n) => groupOf(n, passed, finished, saved);

  check('a funded account is funded', pile('PA-1') === 'funded', pile('PA-1'));
  check('an evaluation is an evaluation', pile('EVAL-1') === 'prop', pile('EVAL-1'));
  check('a finished one is finished', pile('EVAL-2') === 'finished', pile('EVAL-2'));
  check('live and demo share a pile',
        pile('LIVE-1') === 'other' && pile('DEMO-1') === 'other');

  // The rule the tab is built from, stated the way the page states it.
  const trading = [...saved.keys()].filter((n) => pile(n) !== 'finished');
  check('still trading holds every unfinished account, whatever kind',
        trading.join() === 'PA-1,EVAL-1,LIVE-1,DEMO-1', trading);
  check('and holds no finished one', !trading.includes('EVAL-2'));
}

{
  const src = props;

  check('the tab exists and comes first',
        /const TABS = \[\s*\['trading', 'Still trading'\]/.test(src),
        (src.match(/const TABS = \[[\s\S]{0,80}/) || [''])[0].replace(/\s+/g, ' '));

  check('it is filled alongside the exclusive pile, not by it',
        /if \(pile !== 'finished'\) piles\.get\('trading'\)\.push\(name\)/.test(src));

  /* An account must not be double-counted in its OWN pile - the overlap is
   * with `trading` only, and a second push into `pile` would quietly show
   * every card twice. */
  check('and each account still lands in exactly one exclusive pile',
        (src.match(/piles\.get\(pile\)\.push\(name\)/g) || []).length === 1);

  check('the overlap is said, where the counts stop adding up',
        /also appear under their own tab/.test(src));
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
