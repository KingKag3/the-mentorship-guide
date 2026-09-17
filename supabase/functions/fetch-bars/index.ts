/* Nightly price-bar fetch.
 *
 * The first server-side code in this project, and it exists because the chart
 * overlay needs candles the site does not otherwise have. Everything else here
 * is a static page talking to Postgres; this is a Deno function on Supabase,
 * running under the service role, on a schedule.
 *
 *
 * WHERE THE DATA COMES FROM, AND WHAT THAT COSTS
 *
 * Yahoo Finance's chart endpoint. It is undocumented, unofficial, free, and its
 * terms do not permit redistribution - which is what storing the bars and
 * serving them to members is. Raised on 17 September 2026 and accepted by the
 * site's owner with the alternatives on the table; DECISIONS.md carries that
 * entry and supabase/market-bars.sql repeats it.
 *
 * Two things follow, and both are in the code below rather than in good
 * intentions:
 *
 *   1. FAILURE IS ORDINARY. An endpoint with no SLA that can start returning
 *      HTML, a 429, or a different JSON shape on any given night is not an
 *      exception to handle once. Every attempt is recorded in `bar_fetch_log`,
 *      and a day that fails is left for the next run rather than lost.
 *   2. THE FETCH IS ONE FUNCTION. `fetchBars` below is the only thing that
 *      knows what Yahoo is. Moving to a licensed vendor should be that function
 *      and the comments around it, not a rewrite.
 *
 *
 * WHAT IT DOES
 *
 *   POST {}                          - fetch every session that has trades and
 *                                      no bars yet. What the schedule calls.
 *   POST { symbol, day }             - one session, for a retry by hand.
 *   POST { symbol, day, force: true } - refetch one that is already recorded.
 *
 * Callers: the scheduled job, sending FETCH_BARS_SECRET; or a signed-in admin,
 * whose JWT is checked against `profiles.role`. Nothing else. A member's own
 * page never calls this - it reads `market_bars`, which is why the whole point
 * of the nightly run is that no page ever touches the source at request time.
 *
 * FETCH_BARS_SECRET is set on the function in the dashboard. Any long random
 * string will do; it is compared whole. See the README for why it exists rather
 * than reusing the project's service key.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

/* Two symbols, named once. A third is a one-line change here.
 *
 * Micros are mapped rather than fetched: MNQ prints the same price as NQ, so
 * one series is the backdrop for both, and fetching both would store the same
 * candle twice under two names. The same mapping exists in Postgres, in
 * `bar_sessions_wanted`, because that is where the missing sessions are worked
 * out - if you add a symbol, add it in both places. */
const TRACKED_SYMBOLS = ['NQ', 'ES'];

// Root symbol to whatever the source calls it. `=F` is Yahoo's continuous
// front month. NOT back-adjusted, so prices line up with the contract actually
// traded except across a roll, where the old contract's fills sit against the
// new contract's candles. Four days a year, and the page says so rather than
// pretending the marker is exact.
const SOURCE_TICKER: Record<string, string> = { NQ: 'NQ=F', ES: 'ES=F' };

const TIMEFRAME = '5m';
const INTERVAL = '5m';

// Yahoo serves roughly 60 days of intraday history. Asking for more is not an
// error, it is an empty answer, which would otherwise be recorded as a day
// that genuinely had no bars.
const HISTORY_DAYS = 55;

const MAX_ATTEMPTS = 3;
const EXCHANGE_TZ = 'America/New_York';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

/* ------------------------------- time ------------------------------------
 *
 * THE ONLY PART OF THIS WORTH BEING FRIGHTENED OF.
 *
 * A CME session is not a calendar day. NQ and ES trade nearly around the clock
 * with one maintenance break, so the session labelled Tuesday runs from 18:00
 * New York time on Monday to 17:00 on Tuesday.
 *
 * New York, not a fixed offset. The offset is -5 in winter and -4 in summer,
 * and a hardcoded one is right for half the year and silently an hour out for
 * the other half - which would not throw, it would just draw every fill one
 * candle away from where it happened, twice a year, on days nobody would think
 * to check.
 * ------------------------------------------------------------------------- */

/** The UTC instant of a New York wall-clock time. DST-correct by construction. */
function newYorkToUtc(year: number, month: number, day: number, hour: number): Date {
  // Start from the wall clock read as if it were UTC, then subtract whatever
  // offset New York was actually on at that moment. Twice, because the offset
  // at the guess can differ from the offset at the answer within an hour of a
  // DST change.
  let guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  for (let i = 0; i < 2; i++) {
    guess = Date.UTC(year, month - 1, day, hour, 0, 0) + offsetMs(new Date(guess));
  }
  return new Date(guess);
}

/** How far behind UTC New York is at a given instant, in milliseconds. */
function offsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EXCHANGE_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'),
                         get('hour') % 24, get('minute'), get('second'));
  return at.getTime() - asUtc;
}

/** The window of one session: 18:00 New York the evening before, to 17:00 on the day.
 *
 * BOTH ENDS ARE BUILT FROM WALL-CLOCK TIME. The first version of this took the
 * close and subtracted 23 hours, which is right for 363 days a year and wrong
 * on the two that matter: across a DST change the session is 22 or 24 real
 * hours long, not 23. Subtracting a fixed span puts the open an hour out
 * exactly when the clocks move - the failure this whole section exists to
 * avoid, reintroduced one line below the comment warning about it. */
function sessionWindow(day: string): { from: Date; to: Date } {
  const [y, m, d] = day.split('-').map(Number);

  // The previous calendar day, by wall clock. Date.UTC normalises month and
  // year ends, so the 1st of March becomes the 28th of February by itself.
  const prev = new Date(Date.UTC(y, m - 1, d - 1));

  return {
    from: newYorkToUtc(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), 18),
    to: newYorkToUtc(y, m, d, 17)
  };
}

/* ------------------------------ the source -------------------------------
 *
 * Everything that knows what Yahoo is lives between here and the end of
 * `fetchBars`. Nothing above or below reads its shape.
 * ------------------------------------------------------------------------- */

type Bar = {
  symbol: string; timeframe: string; ts: string;
  open: number; high: number; low: number; close: number; volume: number | null;
};

async function fetchBars(symbol: string, day: string): Promise<Bar[]> {
  const ticker = SOURCE_TICKER[symbol];
  if (!ticker) throw new Error('no source ticker for ' + symbol);

  const { from, to } = sessionWindow(day);
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(ticker) +
    '?interval=' + INTERVAL +
    '&period1=' + Math.floor(from.getTime() / 1000) +
    '&period2=' + Math.floor(to.getTime() / 1000) +
    '&includePrePost=true';

  // A browser-ish user agent, because the endpoint answers some clients with
  // an HTML consent page instead of JSON. That it needs saying at all is the
  // argument in market-bars.sql, in one line.
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TradeKarma/1.0)', 'Accept': 'application/json' }
  });

  if (!res.ok) throw new Error('source answered ' + res.status);

  const body = await res.json().catch(() => null);
  const result = body?.chart?.result?.[0];
  if (body?.chart?.error) throw new Error('source error: ' + JSON.stringify(body.chart.error));
  if (!result) throw new Error('source returned no result block');

  /* TIMESTAMPS ARE EPOCH SECONDS, which is the one piece of luck in this file.
   * They are absolute instants, so there is nothing to interpret and no
   * timezone to guess at - the DST care above is needed to ask for the right
   * WINDOW, not to read the answer. `meta.gmtoffset` exists and is deliberately
   * ignored; applying it would move every bar by an offset already accounted
   * for. */
  const stamps: number[] = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const out: Bar[] = [];

  for (let i = 0; i < stamps.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    // Yahoo pads its arrays with nulls for bars that did not trade. A null
    // candle is not a zero candle.
    if (o == null || h == null || l == null || c == null) continue;
    out.push({
      symbol, timeframe: TIMEFRAME,
      ts: new Date(stamps[i] * 1000).toISOString(),
      open: o, high: h, low: l, close: c,
      volume: q.volume?.[i] ?? null
    });
  }

  return out;
}

/* ------------------------------ one session ------------------------------ */

async function doSession(symbol: string, day: string, force = false) {
  const { data: existing } = await supabase
    .from('bar_fetch_log')
    .select('status, attempts')
    .eq('symbol', symbol).eq('trading_day', day)
    .maybeSingle();

  if (!force && existing && (existing.status === 'ok' || existing.status === 'empty')) {
    return { symbol, day, status: existing.status, skipped: true };
  }

  let attempts = existing?.attempts ?? 0;
  let lastError = '';

  for (let tryNo = 0; tryNo < MAX_ATTEMPTS; tryNo++) {
    // Backoff before every attempt but the first. A free endpoint that has
    // just refused is not more likely to agree a millisecond later.
    if (tryNo > 0) await sleep(1000 * Math.pow(3, tryNo));
    attempts++;

    try {
      const bars = await fetchBars(symbol, day);

      if (!bars.length) {
        // Settled, not failed: a holiday, or a day older than the source keeps.
        // Recorded so it is not asked for again every night forever.
        await logRun(symbol, day, 'empty', attempts, 0, 'source returned no bars');
        return { symbol, day, status: 'empty', bars: 0 };
      }

      // Chunked, because a session is around 280 bars and a bad day could be
      // more; one statement per thousand rows is plenty.
      for (let i = 0; i < bars.length; i += 500) {
        const { error } = await supabase
          .from('market_bars')
          .upsert(bars.slice(i, i + 500), { onConflict: 'symbol,timeframe,ts' });
        if (error) throw new Error('write failed: ' + error.message);
      }

      await logRun(symbol, day, 'ok', attempts, bars.length, null);
      return { symbol, day, status: 'ok', bars: bars.length };

    } catch (err) {
      lastError = String(err instanceof Error ? err.message : err);
    }
  }

  // Left as failed on purpose: the next nightly run picks it up again, because
  // `bar_sessions_wanted` excludes only 'ok' and 'empty'.
  await logRun(symbol, day, 'failed', attempts, null, lastError);
  return { symbol, day, status: 'failed', error: lastError };
}

async function logRun(symbol: string, trading_day: string, status: string,
                      attempts: number, bars: number | null, last_error: string | null) {
  await supabase.from('bar_fetch_log').upsert({
    symbol, trading_day, status, attempts, bars, last_error,
    updated_at: new Date().toISOString()
  }, { onConflict: 'symbol,trading_day' });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ who may call -----------------------------
 *
 * THREE WAYS IN, AND THE FIRST ONE EXISTS BECAUSE THE OTHER TWO DEPEND ON
 * THINGS THIS FUNCTION DOES NOT CONTROL.
 *
 * The first version accepted only `SUPABASE_SERVICE_ROLE_KEY` - the value the
 * platform injects - or an admin's JWT. It refused every call on the project it
 * was written for, and the reason is worth keeping: Supabase has two
 * generations of keys, the JWT-shaped `eyJ...` and the newer `sb_secret_...`,
 * and a project on one generation has an injected value that is simply a
 * different string from the key its owner copies out of the dashboard. Nothing
 * is wrong with either key. They are just not equal, which is all the check was
 * asking.
 *
 * So the check no longer depends on guessing which generation a project is on.
 * `FETCH_BARS_SECRET` is a value the owner sets and the caller sends, and it is
 * the same string by construction.
 */

/** Which credential, if any, this request carries. Refusals say which. */
async function callerKind(req: Request): Promise<string> {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return '';

  // 1. A shared secret the owner set on this function. Independent of key
  //    generations, and what the nightly schedule sends.
  const shared = Deno.env.get('FETCH_BARS_SECRET');
  if (shared && token === shared) return 'secret';

  // 2. The platform's own service key, whichever generation it is. Kept so a
  //    project that never sets FETCH_BARS_SECRET still works.
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return 'service';

  // 3. A signed-in admin, for retrying one day by hand from the site.
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return '';

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', data.user.id).maybeSingle();

  return profile?.role === 'admin' ? 'admin' : '';
}

/* CORS, so the retry can be triggered from the site.
 *
 * The README claimed a signed-in admin could call this from the browser, and
 * that was not true as written: a cross-origin POST carrying an Authorization
 * header is preflighted, and a function that answers OPTIONS with "POST only"
 * fails before the real request is ever sent.
 *
 * Origin is `*` rather than the site's own, because the answer is worthless
 * without a credential this function checks itself, and pinning it would break
 * the moment the site is opened from localhost or a preview URL. */
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  const kind = await callerKind(req);
  if (!kind) {
    /* SAY ENOUGH TO DEBUG IT, AND NOTHING THAT HELPS AN ATTACKER.
     *
     * The first refusal of this said `{"error":"not allowed"}` and cost an
     * evening: the logs showed the function booting and shutting down, which
     * proves the request arrived and says nothing about why it was turned away.
     * What follows is the SHAPE of the token - its first three characters and
     * its length - which is enough to tell "you sent the publishable key" from
     * "you sent a key of the wrong generation", and is not enough to reconstruct
     * anything. */
    const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const shape = auth ? auth.slice(0, 3) + '...(' + auth.length + ' chars)' : 'no token';
    console.log('refused a call; token shape: ' + shape +
      '; FETCH_BARS_SECRET is ' + (Deno.env.get('FETCH_BARS_SECRET') ? 'set' : 'NOT set'));

    return json({
      error: 'not allowed',
      sent: shape,
      hint: 'Send FETCH_BARS_SECRET as the bearer token, or sign in as an admin. ' +
            'Set that secret on this function in the dashboard if it is not set.'
    }, 401);
  }

  const body = await req.json().catch(() => ({}));

  // One session, by hand: the retry path for a day that failed.
  if (body.symbol && body.day) {
    const symbol = String(body.symbol).toUpperCase();
    if (!TRACKED_SYMBOLS.includes(symbol)) {
      return json({ error: 'untracked symbol: ' + symbol }, 400);
    }
    const one = await doSession(symbol, String(body.day), body.force === true);
    return json({ ran: [one] });
  }

  // The nightly sweep. Postgres decides what is missing - see
  // `bar_sessions_wanted` in market-bars.sql for why the session maths lives
  // there rather than being written a second time in TypeScript.
  const { data: wanted, error } = await supabase
    .rpc('bar_sessions_wanted', { tracked: TRACKED_SYMBOLS, since_days: HISTORY_DAYS });

  if (error) return json({ error: 'could not list sessions: ' + error.message }, 500);

  const ran = [];
  for (const row of wanted || []) {
    ran.push(await doSession(row.symbol, row.trading_day));
    // Gentle with a free endpoint: a pause between sessions rather than fifty
    // requests as fast as the runtime will issue them.
    await sleep(700);
  }

  return json({
    ran,
    ok: ran.filter((r) => r.status === 'ok').length,
    failed: ran.filter((r) => r.status === 'failed').length
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2),
    { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
