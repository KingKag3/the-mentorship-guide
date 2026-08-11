// ---------------------------------------------------------------------------
// Shared auth helpers.
//
// Everything here runs in the browser and is therefore untrusted. It controls
// what the UI *shows*, not what a user can *reach*. All real enforcement lives
// in the row-level security policies in supabase/schema.sql — if those are
// wrong, nothing in this file will save you.
// ---------------------------------------------------------------------------

// Pinned to the 2.x line rather than an exact patch: the project uses a modern
// sb_publishable_ key, which older 2.x builds predate.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY, IS_CONFIGURED } from './supabase-config.js';

export { IS_CONFIGURED };

export const supabase = IS_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/** Show a loud banner when the project has not been wired up yet. */
export function requireConfig(mountSelector = '#auth-root') {
  if (IS_CONFIGURED) return true;
  const mount = document.querySelector(mountSelector);
  if (mount) {
    mount.innerHTML =
      '<div class="callout risk"><span class="callout-label">Not connected</span>' +
      '<p>Supabase is not configured yet. Open <code>supabase-config.js</code> and paste ' +
      'your project URL and anon key, then follow <a href="https://github.com/KingKag3/the-mentorship-guide/blob/main/SETUP.md">SETUP.md</a>. ' +
      'Until then, sign-in and the members area will not work.</p></div>';
  }
  return false;
}

/**
 * Reject rather than hang.
 *
 * A page whose auth call never settles renders nothing at all: no account
 * strip, no content, no error - identical to a broken build. That has already
 * cost one debugging session. Anything on the critical path to first paint gets
 * a deadline.
 */
const AUTH_TIMEOUT_MS = 12000;

function withTimeout(promise, ms, what) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(what + ' did not answer within ' + Math.round(ms / 1000) + ' seconds')),
      ms
    );
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/** The signed-in user, or null. */
export async function getUser() {
  if (!supabase) return null;
  const { data } = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS, 'The sign-in check');
  return data?.user ?? null;
}

/**
 * The signed-in user's profile row, or null.
 * Returns { id, email, full_name, role, created_at }.
 */
export async function getProfile() {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, created_at')
    .eq('id', user.id)
    .single();
  if (error) return null;
  return data;
}

/**
 * Gate a page. Redirects to login.html if not signed in, or renders an
 * explanation if the account exists but does not hold one of `roles`.
 *
 * Returns the profile on success, null otherwise.
 */
export async function requireRole(roles, mountSelector = '#auth-root') {
  if (!requireConfig(mountSelector)) return null;

  const mountEarly = document.querySelector(mountSelector);

  // Something on screen before the first await, so a slow or stuck auth call
  // reads as "working on it" rather than as an empty page.
  if (mountEarly) {
    mountEarly.innerHTML = '<p class="form-status form-status-info">Checking your session...</p>';
  }

  let profile = null;
  try {
    profile = await getProfile();
  } catch (err) {
    if (mountEarly) {
      mountEarly.innerHTML =
        '<div class="callout risk"><span class="callout-label">Could not check your session</span>' +
        '<p>' + escapeHtml(err && err.message ? err.message : String(err)) + '</p>' +
        '<p>This usually means a stored session that can no longer be refreshed. ' +
        '<a href="login.html">Sign in again</a> to clear it.</p></div>';
    }
    return null;
  }

  if (mountEarly) mountEarly.innerHTML = '';

  if (!profile) {
    const back = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
    location.replace('login.html?next=' + back);
    return null;
  }

  if (!roles.includes(profile.role)) {
    const mount = document.querySelector(mountSelector);

    if (mount && profile.role === 'pending') {
      // A stashed code from the signup form redeems itself on first arrival.
      const auto = await autoRedeemStashed();
      if (auto && auto.ok) { location.reload(); return null; }

      mount.innerHTML =
        '<div class="callout warn"><span class="callout-label">Awaiting approval</span>' +
        '<p>Your account exists but has not been enabled yet. Either an administrator flips it ' +
        'on, or you enter an invite code below.</p>' +
        '<form id="invite-form" class="invite-form">' +
          '<label for="invite-code">Invite code</label>' +
          '<input id="invite-code" type="text" autocomplete="off" spellcheck="false" ' +
                 'placeholder="XXXX-XXXX-XXXX-XXXX" required>' +
          '<button type="submit" class="btn-primary">Redeem</button>' +
          '<p class="form-status" id="status-invite"></p>' +
        '</form>' +
        '</div>';

      wireInviteForm();
    } else if (mount) {
      mount.innerHTML =
        '<div class="callout risk"><span class="callout-label">Not permitted</span>' +
        '<p>This page requires a different account level. You are signed in as <code>' +
        escapeHtml(profile.email) + '</code> with the role <code>' + escapeHtml(profile.role) +
        '</code>.</p></div>';
    }
    return null;
  }

  return profile;
}

/* ------------------------------ invite codes ------------------------------ */

const INVITE_KEY = 'pending_invite_code';

/** Codes are compared stripped and upper-cased, so dashes and case are free. */
export function normaliseCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Display form: groups of four, dash separated. */
export function formatCode(value) {
  return normaliseCode(value).replace(/(.{4})(?=.)/g, '$1-');
}

export function stashInvite(code) {
  try { localStorage.setItem(INVITE_KEY, normaliseCode(code)); } catch (e) { /* private mode */ }
}

export function readStashedInvite() {
  try { return localStorage.getItem(INVITE_KEY); } catch (e) { return null; }
}

export function clearStashedInvite() {
  try { localStorage.removeItem(INVITE_KEY); } catch (e) { /* private mode */ }
}

/**
 * Hand a code to the database. Every check that matters happens there; this
 * only relays the answer.
 */
export async function redeemInvite(code) {
  if (!supabase) return { ok: false, error: 'not_configured' };
  const { data, error } = await supabase.rpc('redeem_invite', { p_code: normaliseCode(code) });
  if (error) return { ok: false, error: error.message };
  return data;
}

/** Redeem a code saved at signup, if there is one. */
export async function autoRedeemStashed() {
  const code = readStashedInvite();
  if (!code) return null;
  const result = await redeemInvite(code);
  if (result && result.ok) clearStashedInvite();
  return result;
}

const INVITE_ERRORS = {
  invalid:       'That code was not recognised. Check it and try again.',
  expired:       'That code has expired. Ask for a new one.',
  revoked:       'That code has been withdrawn.',
  used_up:       'That code has already been used the maximum number of times.',
  no_profile:    'No profile is attached to this login. Sign out and back in.',
  not_signed_in: 'You need to be signed in to redeem a code.',
  not_configured:'The site is not connected to its database yet.'
};

/** Wire the redeem form rendered by requireRole. */
export function wireInviteForm() {
  const form = document.getElementById('invite-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('#status-invite', 'Checking…', 'info');

    const result = await redeemInvite(document.getElementById('invite-code').value);

    if (result && result.ok) {
      clearStashedInvite();
      setStatus('#status-invite', 'Accepted. Opening…', 'ok');
      location.reload();
      return;
    }

    setStatus(
      '#status-invite',
      INVITE_ERRORS[result && result.error] || 'Could not redeem that code.',
      'error'
    );
  });
}

/** Sign out and return to the homepage. */
export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  location.href = 'index.html';
}

/**
 * Fill the account strip in the masthead: who you are, admin link, sign out.
 */
export async function renderAccountStrip(selector = '#account-strip') {
  const el = document.querySelector(selector);
  if (!el) return;

  if (!IS_CONFIGURED) {
    el.innerHTML = '<span class="acct-muted">Not signed in</span>';
    return;
  }

  // Never leave the strip blank while the call is out. An empty masthead is the
  // first thing that made a hung page look like a broken one.
  el.innerHTML = '<span class="acct-muted">checking...</span>';

  let profile = null;
  try {
    profile = await getProfile();
  } catch (err) {
    el.innerHTML = '<a class="acct-link" href="login.html">session expired - sign in</a>';
    return;
  }

  if (!profile) {
    el.innerHTML = '<a class="acct-link" href="login.html">Sign in</a>';
    return;
  }

  const adminLink = profile.role === 'admin'
    ? '<a class="acct-link" href="admin.html">Admin</a>'
    : '';

  // "Account" is spelled out rather than hidden behind the email address.
  //
  // The first version made the email itself the link, on the theory that it is
  // where people look for their own settings. The first person to use it could
  // not find it. An address styled as muted text does not read as a link, and
  // one extra item in the strip costs less than a feature nobody can reach.
  el.innerHTML =
    '<span class="acct-muted">' + escapeHtml(profile.email) + '</span>' +
    '<span class="role-badge role-' + escapeHtml(profile.role) + '">' + escapeHtml(profile.role) + '</span>' +
    '<a class="acct-link" href="account.html">Account</a>' +
    adminLink +
    '<button type="button" class="acct-link" id="sign-out">Sign out</button>';

  const btn = document.getElementById('sign-out');
  if (btn) btn.addEventListener('click', signOut);
}

/* -------------------------------- media ---------------------------------- */

/**
 * Pull the video id out of any common YouTube URL shape: watch?v=, youtu.be/,
 * /embed/, /shorts/, with or without extra parameters.
 * Returns null if nothing looks like an id.
 */
export function youtubeId(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return null;

  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
    /\/live\/([A-Za-z0-9_-]{11})/
  ];

  for (const re of patterns) {
    const hit = raw.match(re);
    if (hit) return hit[1];
  }

  // A bare id pasted on its own.
  return /^[A-Za-z0-9_-]{11}$/.test(raw) ? raw : null;
}

/** Start offset in seconds from a ?t= or #t= parameter, or 0. */
export function youtubeStart(url) {
  const hit = String(url ?? '').match(/[?&#]t=(\d+)/);
  return hit ? Number(hit[1]) : 0;
}

/**
 * Responsive embed markup. Uses youtube-nocookie.com, which holds off on
 * tracking cookies until the viewer actually presses play.
 */
export function youtubeEmbed(url) {
  const id = youtubeId(url);
  if (!id) return '';
  const start = youtubeStart(url);

  return '<div class="video-frame">' +
    '<iframe src="https://www.youtube-nocookie.com/embed/' + id +
      '?rel=0&modestbranding=1' + (start ? '&start=' + start : '') + '" ' +
      'title="Lesson video" loading="lazy" allowfullscreen ' +
      'allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"' +
    '></iframe></div>';
}

/** Only ever emit links we are willing to click. Blocks javascript: and data:. */
export function safeUrl(url) {
  const raw = String(url ?? '').trim();
  try {
    const parsed = new URL(raw, location.origin);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? raw : null;
  } catch (err) {
    return null;
  }
}

/* --------------------------------- tools --------------------------------- */

/**
 * The one list of tools. Every page that shows them renders from here, because
 * three pages had already drifted into three different hand-written link rows
 * and a fourth was about to.
 */
export const TOOLS = [
  { href: 'journal.html', name: 'Journal',
    blurb: 'Log a trade against the vocabulary you are being taught. Private to you.' },
  { href: 'import.html', name: 'Import',
    blurb: 'A broker export straight into the journal, one account at a time.' },
  { href: 'calendar.html', name: 'Calendar',
    blurb: 'Every trading day as a green or red square, and what each one was worth.' },
  { href: 'props.html', name: 'Prop accounts',
    blurb: 'What each funded account has to reach, and how close it is.' },
  { href: 'stats.html', name: 'Statistics',
    blurb: 'Which models, sessions and arrays actually pay, sliced out of your own journal.' },
  { href: 'sizer.html', name: 'Position sizer',
    blurb: 'Contracts from a stop and a risk budget, and when the answer is none.' },
  { href: 'clock.html', name: 'Killzone clock',
    blurb: 'Which window is running, in New York time, all year.' },
  { href: 'smt.html', name: 'SMT checker',
    blurb: 'ES against NQ at a swing, and which one refused to confirm.' },
  { href: 'scripts.html', name: 'Indicators',
    blurb: 'TradingView scripts for the concepts here, with how to install them.' }
];

/* -------------------------------------------------------------------------
   Contract specifications
   -------------------------------------------------------------------------
   One table, imported by the sizer, the journal and the calendar. It used to
   live in sizer.html alone; the moment a second page needed it, two copies
   would have drifted and the two pages would have disagreed about what a
   trade was worth.

   Verify against the CME contract specifications rather than trusting this.
   It is the one thing here that can go silently out of date, and everything
   downstream — dollars, ticks, the calendar totals — inherits the error.
   ------------------------------------------------------------------------- */

export const CONTRACTS = {
  ES:  { perPoint: 50, tick: 0.25, micro: 'MES' },
  MES: { perPoint: 5,  tick: 0.25, micro: null  },
  NQ:  { perPoint: 20, tick: 0.25, micro: 'MNQ' },
  MNQ: { perPoint: 2,  tick: 0.25, micro: null  }
};

/** The spec for a symbol, or null when it is one we do not know. */
/**
 * The journal's session vocabulary, and the windows that produce it.
 *
 * These are the exact strings the journal's datalist offers and the statistics
 * page slices on, so anything deriving a session has to emit one of them
 * character for character - a trade tagged "London killzone" and one tagged
 * "London 02:00-05:00" are two rows in a table that should have been one.
 *
 * Deliberately NOT the same list as the killzone clock's. That one answers
 * "what is running now" and its windows overlap on purpose - CBDR sits inside
 * the afternoon, London close inside the Silver Bullet hour. A trade carries
 * one tag, so this list has to tile instead. The two are different questions
 * and merging them would break one of them.
 *
 * Listed in the order a trading day runs, because this is also what the journal
 * shows in its dropdown. Order does not affect matching: where two windows
 * cover the same minute the NARROWER one wins, so a 09:45 trade is tagged
 * Opening range rather than New York without either being listed first.
 *
 * Minutes past New York midnight. 00:00-02:00, 05:00-07:00 and 16:00-20:00 are
 * deliberately unnamed - a trade there gets no tag rather than a wrong one.
 */
const hm = (h, m = 0) => h * 60 + m;

export const SESSIONS = [
  { label: 'Asian 20:00-00:00',          from: hm(20),     to: hm(24) },
  { label: 'London 02:00-05:00',         from: hm(2),      to: hm(5) },
  { label: 'New York 07:00-10:00',       from: hm(7),      to: hm(10) },
  { label: 'Opening range 09:30-10:00',  from: hm(9, 30),  to: hm(10) },
  { label: 'Silver bullet 10:00-11:00',  from: hm(10),     to: hm(11) },
  { label: 'Late morning 11:00-12:00',   from: hm(11),     to: hm(12) },
  { label: 'Lunch 12:00-13:30',          from: hm(12),     to: hm(13, 30) },
  { label: 'Afternoon 13:30-15:00',      from: hm(13, 30), to: hm(15) },
  { label: 'Into the close 15:00-16:00', from: hm(15),     to: hm(16) }
];

/**
 * Which session a moment falls in, or null outside all of them.
 *
 * Computed in America/New_York whatever the reader's own clock says, because
 * every window in this methodology is New York local and a member in London
 * must not get a different answer for the same trade.
 */
export function sessionAt(when) {
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d);

  const hour = Number(parts.find((p) => p.type === 'hour').value) % 24;
  const mins = hour * 60 + Number(parts.find((p) => p.type === 'minute').value);

  // Narrowest wins. Opening range sits inside New York, and the specific
  // answer is the useful one; anything else would depend on list order, which
  // is a fragile thing to hang a statistic on.
  let best = null;
  for (const s of SESSIONS) {
    if (mins >= s.from && mins < s.to) {
      if (!best || (s.to - s.from) < (best.to - best.from)) best = s;
    }
  }
  return best ? best.label : null;
}

/* ------------------------------ sharing safely ----------------------------

   A screenshot of your accounts is a good thing to post and a bad thing to
   post carelessly: the account number is the account.

   Blurring is the obvious answer and the wrong one. A blur, a pixelation or a
   black bar over live text is a filter applied to something still present -
   the characters remain in the DOM, in the page source, and often recoverable
   from the image itself. People have been unmasked by pixelated screenshots
   more than once.

   So nothing is obscured. The names are REPLACED before they are drawn, with
   stable aliases numbered in the order the accounts sort. A screenshot cannot
   leak what was never rendered, and you can still tell which account is which,
   because the numbering does not move between refreshes.

   **The exact guarantee, stated rather than implied:** no real account name is
   rendered as text. They do remain in attributes - a form has to know which
   account it saves to - so this protects a screenshot, a screen share and a
   recording. It is not a defence against somebody handed the page source, and
   nothing in a browser could be.
--------------------------------------------------------------------------- */

const PRIVACY_KEY = 'tk_hide_accounts';

export function accountsHidden() {
  try { return localStorage.getItem(PRIVACY_KEY) === '1'; } catch (e) { return false; }
}

export function setAccountsHidden(on) {
  try { localStorage.setItem(PRIVACY_KEY, on ? '1' : '0'); } catch (e) { /* private mode */ }
}

/**
 * A stable alias map for a set of account names.
 *
 * Sorted first so the numbering is the same on every page and every reload -
 * an alias that moved would be worse than none, because you would read the
 * wrong row and not know it.
 */
export function aliasMap(names) {
  const out = new Map();
  [...new Set(names)].sort().forEach((n, i) => out.set(n, 'Account ' + (i + 1)));
  return out;
}

export function contractFor(symbol) {
  const key = String(symbol ?? '').trim().toUpperCase();
  return CONTRACTS[key] || null;
}

/**
 * Points, ticks and dollars for a closed trade.
 *
 * Dollars are deliberately not stored on the row. They are a function of
 * points, contracts and the contract spec, so storing them would create a
 * second version of the truth that could disagree with the prices — the same
 * reason points and R are derived rather than typed.
 *
 * Returns nulls rather than zeros for anything unknown, so a display can tell
 * "no result" from "broke even".
 */
/**
 * Number() with the hole closed: null, undefined and '' all become NaN.
 *
 * `Number(null)` is 0, not NaN, which is the wrong answer everywhere a value
 * is optional. It made a trade with no prices report a derived result of
 * $0.00 and then flag a false disagreement against the figure its owner had
 * actually typed, and it made "has a result" true for a row that had neither.
 */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return Number(value);
}

/**
 * Turn a missing-migration error into the file that fixes it.
 *
 * Postgres says "column trades.account does not exist" and PostgREST says
 * "Could not find the 'account' column of 'trades' in the schema cache". Both
 * are correct and neither tells you which of eight SQL files to run, which is
 * the only thing the reader needs.
 */
const MIGRATIONS = [
  // Listed above the looser patterns: "prop_accounts" contains "account",
  // which would otherwise send the reader to trade-accounts.sql.
  [/prop_accounts|prop_presets/i,        'supabase/prop-accounts.sql'],
  [/risk_settings/i,                     'supabase/risk-settings.sql'],
  [/trade_exits/i,                       'supabase/trade-exits.sql'],
  [/(account|net_pnl)/i,                 'supabase/trade-accounts.sql'],
  [/fees/i,                              'supabase/trade-exits.sql'],
  [/settings/i,                          'supabase/settings.sql'],
  [/scripts/i,                           'supabase/scripts.sql'],
  [/lesson_links|video_url/i,        'supabase/lesson-media.sql'],
  [/phase_id|phases/i,              'supabase/phases.sql'],
  [/trades/i,                            'supabase/trades.sql']
];

export function migrationHint(error) {
  const raw = error && error.message ? error.message : String(error ?? '');

  // Not a missing object at all: the index exists but was created partial, so
  // an upsert cannot address it. Named separately because the message says
  // nothing about which table it happened on.
  if (/ON CONFLICT specification/i.test(raw)) return 'supabase/trade-import-fix.sql';

  const missing = /does not exist|schema cache|Could not find/i.test(raw);
  if (!missing) return null;

  for (const [pattern, file] of MIGRATIONS) {
    if (pattern.test(raw)) return file;
  }
  return null;
}

/**
 * A database error as something a person can act on. Falls back to the raw
 * message, which is better than nothing when the cause is not a migration.
 */
export function dbError(error, heading = 'Could not load') {
  const raw = error && error.message ? error.message : String(error ?? '');
  const file = migrationHint(error);

  return '<div class="callout risk"><span class="callout-label">' + escapeHtml(heading) +
    '</span><p>' + escapeHtml(raw) + '</p>' +
    (file
      ? '<p>This part of the schema has not been created yet. Run <code>' + file +
        '</code> in the Supabase SQL editor, then reload.</p>'
      : '') +
    '</div>';
}

/** True when a trade has a result at all: an R multiple, or a reported figure. */
export function hasResult(row) {
  return Number.isFinite(toNumber(row.r_multiple)) || Number.isFinite(toNumber(row.net_pnl));
}

export function tradeValue({ symbol, points, contracts, fees, netPnl }) {
  const spec = contractFor(symbol);
  const pts = toNumber(points);
  const size = toNumber(contracts);
  const cost = toNumber(fees);
  const reported = toNumber(netPnl);
  const hasReported = Number.isFinite(reported);

  const ticks = Number.isFinite(pts) && spec ? pts / spec.tick : null;
  const gross = Number.isFinite(pts) && spec && Number.isFinite(size)
    ? pts * spec.perPoint * size
    : null;

  // Fees are the only part of a derived result the prices cannot produce.
  const paid = Number.isFinite(cost) ? cost : 0;
  const derived = gross === null ? null : gross - paid;

  // A reported figure wins, because it is what the account actually paid.
  // Both are kept: a gap between them is slippage, an unrecorded partial, or a
  // typo, and each of those is worth seeing rather than smoothing away.
  const dollars = hasReported ? reported : derived;
  const disagrees = hasReported && derived !== null && Math.abs(reported - derived) >= 0.01;

  return {
    points: Number.isFinite(pts) ? pts : null,
    ticks,
    gross,
    derived,
    dollars,
    reported: hasReported ? reported : null,
    disagrees,
    fees: Number.isFinite(cost) ? cost : null,
    spec
  };
}

/**
 * Weighted average exit across partials, and the size that came off.
 *
 * The weighted average is exact rather than a convenience: summing each
 * partial's own profit gives the same figure as treating the whole position as
 * closing at this one price, because
 *
 *     sum((price_i - entry) * size_i) === (weightedAvg - entry) * sum(size_i)
 *
 * which is what lets `points`, `r_multiple` and everything downstream stay on
 * the columns they already read.
 */
export function weightedExit(exits) {
  let size = 0;
  let notional = 0;

  for (const e of exits || []) {
    const c = toNumber(e.contracts);
    const p = toNumber(e.price);
    if (!Number.isFinite(c) || !Number.isFinite(p) || c <= 0) continue;
    size += c;
    notional += c * p;
  }

  return size > 0 ? { price: notional / size, contracts: size } : null;
}

/** $1,234.50, with the sign kept because a loss reading as a gain is worse than ugly. */
/* ------------------------------ taking it out -----------------------------
 *
 * A journal you cannot get out of is a journal you are renting. Import has
 * existed since the beginning and export never did, which is the wrong way
 * round for something a member is asked to put three months of their own work
 * into.
 */

/**
 * Rows to CSV.
 *
 * Two things this does that a join with commas does not:
 *
 * Quoting. Any field carrying a comma, a quote or a newline is wrapped and its
 * quotes doubled — a trade note saying `broke out, then failed` would otherwise
 * silently become two columns and shift every field after it.
 *
 * Formula injection. A field beginning =, +, - or @ is a live formula to Excel
 * and Sheets, and `=cmd|...` in a spreadsheet is a genuine attack rather than a
 * curiosity. Prefixing with an apostrophe makes it text. Nobody is attacking
 * their own journal, but a member who imports a broker file and exports it
 * again should not be handed a weapon by us.
 */
export function toCsv(rows, columns) {
  const cols = columns || (rows.length ? Object.keys(rows[0]) : []);
  if (!cols.length) return '';

  const cell = (v) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  return [cols.join(',')]
    .concat(rows.map((r) => cols.map((c) => cell(r[c])).join(',')))
    .join('\r\n');
}

/** Hand a string to the browser as a file. Revoked straight after, so a long
 *  session does not accumulate object URLs nobody can reach. */
export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `trade-karma-journal-2026-08-11.csv` — sorts correctly in a folder. */
export function stampedName(stem, ext = 'csv') {
  return stem + '-' + new Date().toISOString().slice(0, 10) + '.' + ext;
}

export function money(value) {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  return sign + '$' + Math.abs(value).toLocaleString('en-US',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * The local calendar day a timestamp falls on, as YYYY-MM-DD.
 *
 * Local, not UTC: a trade at 20:00 New York is that day's trade, and
 * toISOString() would file it under tomorrow.
 */
export function localDay(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

const SEEN_KEY = 'tk_scripts_seen_at';

/** When this browser last opened the indicators page. */
function scriptsSeenAt() {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? Number(raw) : 0;
  } catch (err) {
    return 0;
  }
}

/** Called by scripts.html on load, which is what clears the badge. */
export function markScriptsSeen() {
  try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch (err) { /* private mode */ }
}

/**
 * How many published indicators have changed since this browser last looked.
 *
 * Kept in localStorage rather than a column on profiles: it is a per-device
 * convenience, not a fact about the member, and it needs no migration. The cost
 * is that a second device shows the badge again, which is the right way round -
 * better to be told twice than never.
 */
export async function newScriptCount() {
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('scripts')
    .select('updated_at')
    .eq('published', true);

  if (error || !data) return 0;

  const seen = scriptsSeenAt();
  return data.filter((row) => new Date(row.updated_at).getTime() > seen).length;
}

/**
 * One value from the settings table, or null.
 *
 * Returns null rather than throwing on any failure — a missing table, a
 * missing key, no permission. Every caller is decorating a page that has to
 * render without it, so a settings lookup must never be able to take the page
 * down with it.
 */
export async function getSetting(key) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error) return null;
    return data && data.value ? data.value : null;
  } catch (err) {
    return null;
  }
}

/** Write one setting. Admin only, enforced by row-level security. */
export async function setSetting(key, value) {
  if (!supabase) return { error: new Error('not configured') };
  return await supabase
    .from('settings')
    .upsert({ key, value: value || null }, { onConflict: 'key' });
}

/**
 * Full cards, for the members index.
 * `badges` maps an href to a short string rendered as a flag on that card.
 */
export function renderToolCards(selector, badges = {}) {
  const mount = document.querySelector(selector);
  if (!mount) return;

  mount.innerHTML = TOOLS.map((tool) => {
    const badge = badges[tool.href]
      ? '<span class="tool-badge">' + escapeHtml(badges[tool.href]) + '</span>'
      : '';
    return '<a class="card" href="' + tool.href + '">' +
      '<h3>' + escapeHtml(tool.name) + badge + '</h3>' +
      '<p>' + escapeHtml(tool.blurb) + '</p>' +
    '</a>';
  }).join('');
}

/**
 * Compact rail for the tool pages themselves, so moving between them does not
 * mean going back to the index first. The current page is shown but not linked.
 */
export function renderToolRail(selector, currentHref, badges = {}) {
  const mount = document.querySelector(selector);
  if (!mount) return;

  mount.className = 'tool-rail';
  mount.innerHTML = TOOLS.map((tool) => {
    const badge = badges[tool.href]
      ? '<span class="tool-badge">' + escapeHtml(badges[tool.href]) + '</span>'
      : '';
    return tool.href === currentHref
      ? '<span class="tool-chip is-current" aria-current="page">' +
          escapeHtml(tool.name) + badge + '</span>'
      : '<a class="tool-chip" href="' + tool.href + '">' +
          escapeHtml(tool.name) + badge + '</a>';
  }).join('');
}

/* ---------------------------- Discord markup ----------------------------- */

/**
 * Cheap test for whether a lump of plain text is worth running through the
 * converter. Deliberately conservative: a false negative just means the text
 * pastes unformatted, which is recoverable. A false positive mangles prose.
 */
export function looksLikeDiscordMarkup(text) {
  return /(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(`[^`\n]+`)|(^#{1,3} )|(^-# )|(^> )|(^>>> )|(^[-*] )|(^\d+[.)] )|(\[[^\]]+\]\(https?:)|(```)/m
    .test(String(text || ''));
}

/**
 * Discord markup to HTML.
 *
 * Follows Discord's dialect, not CommonMark - the notable divergence is that
 * __text__ is underline here, where standard markdown would read it as bold.
 * Getting that wrong silently changes what a lesson looks like, so it is worth
 * being deliberate about.
 *
 * Output is built from escaped text, so it carries nothing executable.
 */
export function discordToHtml(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];

  let listType = null;      // 'ul' | 'ol' | null
  let quoting = false;      // inside a >>> block
  let index = 0;

  const closeList = () => {
    if (listType) { out.push('</' + listType + '>'); listType = null; }
  };

  const openList = (type) => {
    if (listType !== type) { closeList(); out.push('<' + type + '>'); listType = type; }
  };

  while (index < lines.length) {
    const line = lines[index];

    // ``` fenced code, optionally with a language on the opening fence
    if (/^```/.test(line.trim())) {
      closeList();
      const body = [];
      index++;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        body.push(lines[index]);
        index++;
      }
      index++;                                    // skip the closing fence
      out.push('<pre>' + escapeHtml(body.join('\n')) + '</pre>');
      continue;
    }

    // >>> quotes everything that follows
    if (/^>>>\s?/.test(line)) {
      closeList();
      quoting = true;
      out.push('<blockquote>' + inlineMarkup(line.replace(/^>>>\s?/, '')) + '</blockquote>');
      index++;
      continue;
    }

    if (quoting) {
      if (line.trim()) out.push('<blockquote>' + inlineMarkup(line) + '</blockquote>');
      index++;
      continue;
    }

    // > single-line quote
    if (/^>\s?/.test(line)) {
      closeList();
      out.push('<blockquote>' + inlineMarkup(line.replace(/^>\s?/, '')) + '</blockquote>');
      index++;
      continue;
    }

    // -# subtext. Quill has no small text, so it lands as emphasis.
    if (/^-#\s+/.test(line)) {
      closeList();
      out.push('<p><em>' + inlineMarkup(line.replace(/^-#\s+/, '')) + '</em></p>');
      index++;
      continue;
    }

    // # headings. Quill's toolbar carries two levels, so three map onto two.
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeList();
      const tag = heading[1].length === 1 ? 'h2' : 'h3';
      out.push('<' + tag + '>' + inlineMarkup(heading[2]) + '</' + tag + '>');
      index++;
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      openList('ul');
      out.push('<li>' + inlineMarkup(bullet[1]) + '</li>');
      index++;
      continue;
    }

    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (numbered) {
      openList('ol');
      out.push('<li>' + inlineMarkup(numbered[1]) + '</li>');
      index++;
      continue;
    }

    if (!line.trim()) {
      closeList();
      index++;
      continue;
    }

    closeList();
    out.push('<p>' + inlineMarkup(line) + '</p>');
    index++;
  }

  closeList();
  return out.join('');
}

/** Inline spans within one line. */
function inlineMarkup(raw) {
  const codes = [];

  // Pull code spans out first so their contents are never treated as markup.
  // The placeholder uses a control character, which cannot survive escaping as
  // anything else and will not appear in real prose.
  let text = String(raw).replace(/`([^`\n]+)`/g, (match, body) => {
    codes.push(body);
    return '\u0000' + (codes.length - 1) + '\u0000';
  });

  text = escapeHtml(text);

  // [label](url) - only http(s), so a markup link cannot smuggle javascript:
  text = text.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (match, label, url) =>
      '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>'
  );

  // Spoilers have no equivalent here, so the markers are dropped and the text
  // kept rather than silently losing the content.
  text = text.replace(/\|\|([\s\S]+?)\|\|/g, '$1');

  text = text.replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([\s\S]+?)__/g, '<u>$1</u>');       // Discord: underline
  text = text.replace(/~~([\s\S]+?)~~/g, '<s>$1</s>');
  text = text.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');

  return text.replace(/\u0000(\d+)\u0000/g,
    (match, position) => '<code>' + escapeHtml(codes[Number(position)]) + '</code>');
}

/* -------------------------------- storage -------------------------------- */

export const MEDIA_BUCKET = 'lesson-media';

/** How long a signed link stays good. Long enough to read a page, not to share. */
const SIGN_SECONDS = 3600;

/** One signed URL, or null if the caller is not allowed to read it. */
export async function signedUrl(path, seconds = SIGN_SECONDS) {
  if (!supabase || !path) return null;
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, seconds);
  return error ? null : data.signedUrl;
}

/** Many at once - one round trip rather than one per slide. */
export async function signedUrlMap(paths, seconds = SIGN_SECONDS) {
  const map = new Map();
  const unique = [...new Set((paths || []).filter(Boolean))];
  if (!supabase || !unique.length) return map;

  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(unique, seconds);

  if (error || !data) return map;
  for (const row of data) {
    if (row.signedUrl && !row.error) map.set(row.path, row.signedUrl);
  }
  return map;
}

/**
 * Lesson bodies store <img data-path="…"> with no src, because a signed URL
 * baked into the database would be dead within the hour. This fills the src in
 * at render time.
 */
export async function hydrateStorageImages(root) {
  const images = Array.from(root.querySelectorAll('img[data-path]'));
  if (!images.length) return;

  const urls = await signedUrlMap(images.map((img) => img.dataset.path));

  for (const img of images) {
    const url = urls.get(img.dataset.path);
    if (url) {
      img.src = url;
      img.loading = 'lazy';
    } else {
      img.replaceWith(Object.assign(document.createElement('p'), {
        className: 'media-missing',
        textContent: '[image unavailable]'
      }));
    }
  }
}

/**
 * Shrink a screenshot before upload. Slides compress enormously as WebP with
 * no visible loss, which is the difference between the free tier lasting
 * months and lasting weeks.
 *
 * Falls back to the original file if anything goes wrong or if it is already
 * small.
 */
export async function compressImage(file, maxWidth = 1600, quality = 0.82) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality)
    );

    // If WebP is unsupported or somehow bigger, keep the original.
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' });
  } catch (err) {
    return file;
  }
}

/**
 * A data: URI as a File, so a pasted image can go through the same compress and
 * upload path as a chosen one. fetch() decodes a data URI without touching the
 * network, which is the shortest correct way to get the bytes back.
 */
export async function dataUrlToFile(dataUrl, name = 'pasted') {
  const blob = await (await fetch(dataUrl)).blob();
  const ext = ((blob.type.split('/')[1] || 'png').match(/[a-z0-9]+/) || ['png'])[0];
  return new File([blob], name + '.' + ext, { type: blob.type || 'image/png' });
}

/** Upload to the private bucket, returning the stored path. */
export async function uploadMedia(file, folder = 'lessons') {
  const ext = (file.name.match(/\.(\w+)$/) || [, 'bin'])[1].toLowerCase();
  const path = folder + '/' + crypto.randomUUID() + '.' + ext;

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' });

  if (error) throw error;
  return path;
}

export function humanSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

/** Minimal escaping for anything that came out of the database. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/** Render a short status line under a form. */
export function setStatus(selector, message, kind = 'info') {
  const el = document.querySelector(selector);
  if (!el) return;
  el.className = 'form-status form-status-' + kind;
  el.textContent = message;
}
