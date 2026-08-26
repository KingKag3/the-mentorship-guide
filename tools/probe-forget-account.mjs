/* Runs the real forgetBlock / describeTrades / forgetAccount out of props.html
 * against three shapes, with a fake supabase that records every delete. */
import fs from 'node:fs';

const src = fs.readFileSync('props.html', 'utf8');
const grab = (name) => {
  const i = src.indexOf(name);
  if (i < 0) throw new Error('not found: ' + name);
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; started = true; }
    else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
};

const body = [grab('function forgetBlock(name, cfg) {'),
              grab('function describeTrades(list) {'),
              grab('async function forgetAccount(name) {')].join('\n\n');

const deletes = [];
const make = (state) => {
  const ctx = {
    allTrades: state.trades.slice(),
    trades: state.trades.slice(),
    adjustments: state.adjustments.slice(),
    names: state.names.slice(),
    saved: new Map(state.saved),
    attemptsByAccount: new Map(),
    profile: { id: 'me' },
    escapeHtml: (s) => String(s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    label: (n) => n,
    hidden: !!state.hidden,
    money: (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2),
    dollars: (t) => Number(t.net_pnl) || 0,
    setStatus: (_, m, tone) => ctx.status.push([tone, m]),
    migrationHint: () => false,
    confirm: (m) => { ctx.asked.push(m); return state.answer !== false; },
    render: () => ctx.rendered++,
    renderBulk: () => {},
    status: [], asked: [], rendered: 0,
    supabase: { from: (table) => { const f = { table, filters: {} };
      return { delete: () => { deletes.push(f); return {
        eq(k, v) { f.filters[k] = v; return this; },
        then(res) { return Promise.resolve({ error: null }).then(res); }
      }; } }; } }
  };
  const keys = Object.keys(ctx);
  const fn = new Function(...keys, body + '\n; return { forgetBlock, forgetAccount, describeTrades, ctx: arguments };');
  const api = fn(...keys.map((k) => ctx[k]));
  return { api, ctx };
};

const t = (id, account, day, pnl) =>
  ({ id, account, opened_at: day + 'T14:30:00Z', net_pnl: pnl });

let bad = 0;
const check = (what, ok, detail) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + what + (detail ? '  ' + detail : ''));
  if (!ok) bad++;
};

/* ---- shape 1: trades only, no config row. The typo'd import. ---- */
{
  const { api, ctx } = make({
    trades: [t(1, 'APEX001', '2026-08-26', -120), t(2, 'APEX001', '2026-08-24', 40)],
    adjustments: [], names: ['APEX001', 'REAL'], saved: []
  });
  const html = api.forgetBlock('APEX001', undefined);
  check('trades-only account offers removal', html.includes('data-forget="APEX001"'));
  check('button names the trade count', html.includes('and its 2 trades'), html.match(/>[^<]*Delete[^<]*</)?.[0]);
  deletes.length = 0;
  await api.forgetAccount('APEX001');
  check('confirmation names count, span and worth',
    /2 trades, .*2026.* to .*2026.*, worth -\$80\.00 between them/.test(ctx.asked[0] || ''), ctx.asked[0]);
  check('deletes four tables', deletes.length === 4, deletes.map((d) => d.table).join(','));
  check('trades deleted last', deletes[3] && deletes[3].table === 'trades');
  check('every delete scoped to user and account',
    deletes.every((d) => d.filters.user_id === 'me' && d.filters.account === 'APEX001'));
  check('name gone from the list', !ctx.names.includes('APEX001'), ctx.names.join(','));
  check('rows gone from both arrays', ctx.trades.length === 0 && ctx.allTrades.length === 0);
  check('other account untouched', ctx.names.includes('REAL'));
}

/* ---- shape 2: config row, no trades. The test account. ---- */
{
  const { api, ctx } = make({
    trades: [], adjustments: [{ account: 'TEST', amount: 5 }],
    names: ['TEST'], saved: [['TEST', { id: 9, account: 'TEST' }]]
  });
  const html = api.forgetBlock('TEST', { id: 9 });
  check('config-only account offers removal', html.includes('data-forget="TEST"'));
  check('says no trade is touched', html.includes('No trade'));
  deletes.length = 0;
  await api.forgetAccount('TEST');
  check('confirmation does not invent trades', !/\btrades?\b,/.test(ctx.asked[0] || ''), ctx.asked[0]);
  check('skips the trades table when there are none',
    deletes.length === 3 && !deletes.some((d) => d.table === 'trades'),
    deletes.map((d) => d.table).join(','));
  check('adjustment forgotten too', ctx.adjustments.length === 0);
  check('saved row forgotten', !ctx.saved.has('TEST'));
}

/* ---- shape 3: neither. Nothing to offer. ---- */
{
  const { api } = make({ trades: [], adjustments: [], names: [], saved: [] });
  check('unknown account offers nothing', api.forgetBlock('GHOST', undefined) === '');
  check('unconfigured, untraded name offers nothing', api.forgetBlock('GHOST', {}) === '');
}

/* ---- shape 4: a trade with no result still counts ---- */
{
  const { api, ctx } = make({
    trades: [t(1, 'OPEN', '2026-08-26', null)], adjustments: [], names: ['OPEN'], saved: []
  });
  check('an unresulted row is still counted', api.forgetBlock('OPEN', undefined).includes('1 trade'));
  await api.forgetAccount('OPEN');
  check('and still named in the confirmation', /1 trade,/.test(ctx.asked[0] || ''), ctx.asked[0]);
}

/* ---- shape 5: declining changes nothing ---- */
{
  const { api, ctx } = make({
    trades: [t(1, 'KEEP', '2026-08-26', -10)], adjustments: [], names: ['KEEP'], saved: [], answer: false
  });
  deletes.length = 0;
  await api.forgetAccount('KEEP');
  check('saying no deletes nothing', deletes.length === 0 && ctx.trades.length === 1);
}

/* ---- shape 6: names hidden - no button at all ---- */
{
  const { api } = make({
    trades: [t(1, 'HIDE', '2026-08-26', -10)], adjustments: [], names: ['HIDE'],
    saved: [], hidden: true
  });
  const html = api.forgetBlock('HIDE', undefined);
  check('hidden names offer no delete button', !html.includes('data-forget'));
  check('and say why', html.includes('Turn account names back on'));
  check('and do not print the name', !html.includes('HIDE'));
}

console.log(bad ? '\n' + bad + ' failed' : '\nall passed');
process.exit(bad ? 1 : 0);
