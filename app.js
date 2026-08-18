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

  touchLastSeen(profile);
  return profile;
}

/* --------------------------- who is still here ---------------------------
 *
 * One write per member per day, so an admin can see who has stopped coming.
 *
 * WHY IT IS HERE. requireRole is the only chokepoint every members page passes
 * through. Calling this from each page instead would mean remembering to, on
 * every page added from now on, and the first one forgotten would quietly
 * under-report somebody as having left.
 *
 * WHAT IT DELIBERATELY IS NOT. Not awaited, not checked, and wrapped so it can
 * never reject. This is the least important write on the site and it sits on
 * the critical path of every members page: a Supabase hiccup, a missing column
 * because the migration has not been run, an ad blocker - none of those may
 * cost anybody their journal. If it fails, nothing anywhere says so, and that
 * is correct. The consequence of losing one is one member looking a day staler
 * than they are.
 *
 * THE THROTTLE IS THE POINT. Fifty members opening six pages a day is three
 * hundred writes to record fifty dates. The stamp is a date rather than a
 * timestamp, so a second visit the same day has nothing to add.
 *
 * Keyed by user id, because two accounts share a browser more often than is
 * comfortable - a mentor checking what a member sees is exactly this - and a
 * single flag would let whoever signed in first suppress the other's write for
 * the rest of the day.
 */

/* Not SEEN_KEY. That name is already taken further down this file, by the
 * scripts page's "what is new since you last looked" stamp - and a second
 * top-level `const` of the same name is a SyntaxError that stops app.js from
 * loading at all, which blanks every page on the site. It got as far as a
 * browser because `node --check` does not catch it: see tools/check-duplicates.py. */
const LAST_SEEN_KEY = 'member_last_seen_stamp';

function touchLastSeen(profile) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = LAST_SEEN_KEY + ':' + profile.id;
    if (localStorage.getItem(key) === today) return;

    // Written before the request rather than after it. If the write fails, the
    // cost is one missed day; if it is written after and the page is closed
    // mid-flight, every subsequent load retries forever.
    localStorage.setItem(key, today);

    supabase.from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', profile.id)
      .then(() => {}, () => {});
  } catch (err) {
    // Private browsing has no localStorage. Skipping the stamp entirely is
    // better than writing on every page load to a column nobody reads live.
  }
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
    ? '<a class="acct-link" href="admin.html" id="admin-link">Admin' +
      '<span class="acct-count" id="review-waiting" hidden></span></a>'
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

  /* The waiting count, filled in after the strip is already drawn.
   *
   * Not awaited, on purpose. It is two queries, and the masthead must not wait
   * on them - the strip is the first thing that made a hung page look like a
   * broken one, and adding a slow call to it would recreate that.
   *
   * It stays hidden at zero rather than showing a 0. A badge reading zero is
   * furniture; a badge that only appears when there is something to do is a
   * notification. */
  if (profile.role === 'admin') {
    countWaitingReviews().then((n) => {
      const dot = document.getElementById('review-waiting');
      if (!dot || !n) return;
      dot.textContent = String(n);
      dot.hidden = false;
      const link = document.getElementById('admin-link');
      if (link) {
        link.title = n === 1
          ? '1 shared trade is waiting on a reply'
          : n + ' shared trades are waiting on a reply';
      }
    }, () => {});
  }
}

/* --------------------------- reading more than a thousand rows -------------
 *
 * POSTGREST REFUSES TO RETURN MORE THAN A THOUSAND ROWS, AND SAYS NOTHING.
 *
 * Supabase sets `db-max-rows` to 1000. A `.limit(5000)` is not an error and
 * does not warn: the request succeeds, a thousand rows come back, and the page
 * draws whatever it was given as though that were everything.
 *
 * Five pages here asked for 2,001, 5,000, 5,001 and 20,000. Every one of them
 * has been reading a thousand for as long as anybody has had a thousand
 * trades. The calendar showed it first - eight trades short on the oldest day
 * it displayed, which is exactly 1,142 rows minus the thousand it was allowed.
 * Nothing else showed it at all, and the statistics page was computing win
 * rates and bootstraps over a truncated set while saying it had read them all.
 *
 * `.range(from, to)` pages past it. The builder is single-use, so this takes a
 * function that makes a fresh one rather than a query.
 *
 *     const { data, error, capped } = await fetchPaged(
 *       () => supabase.from('trades').select('*').order('opened_at'), 5000);
 *
 * An ORDER is required, not optional: without one Postgres may return rows in
 * any order and two pages can then overlap or miss.
 *
 * `capped` is true only when the cap was genuinely reached, so a page can say
 * so honestly rather than guessing from a round number.
 */
const PAGE = 1000;

export async function fetchPaged(build, cap = 20000) {
  const out = [];

  for (let from = 0; from < cap; from += PAGE) {
    const to = Math.min(from + PAGE, cap) - 1;
    const { data, error } = await build().range(from, to);
    if (error) return { data: null, error, capped: false };

    const got = data || [];
    out.push(...got);

    // Short page means the end of the table, whatever the cap says.
    if (got.length < to - from + 1) return { data: out, error: null, capped: false };
  }

  return { data: out, error: null, capped: true };
}

/* --------------------------- the mentor's queue ---------------------------
 *
 * The rule for "is this trade still waiting on a reply" lives here rather than
 * on the admin page, because two places now ask it: the Review tab, and the
 * count in the masthead on every members page.
 *
 * That is the same reason distinctDecisions moved here. Two copies of a rule
 * this fiddly do not stay equal - and a badge saying three while the tab shows
 * two is worse than no badge, because it sends somebody looking for work that
 * is not there.
 */

/**
 * Who wrote a message: the trade's owner, or somebody else.
 *
 * By comparing ids, never by looking the author's role up. A role is current
 * and a message is history, so asking "is this author an admin" would turn
 * every question a member ever asked into a mentor's answer on the day they
 * were promoted. This comparison cannot go stale - neither side of it changes.
 */
export function fromMember(msg, trade) {
  return msg.author_id === trade.user_id;
}

/**
 * Three ways a shared trade is waiting, and the second is the one that made
 * this a conversation rather than a drop box:
 *
 *   a) nobody has written anything;
 *   b) the newest message is from the member - they had the last word, whether
 *      that is the first question or an answer to a reply;
 *   c) the newest MENTOR message predates the trade's updated_at, so editing a
 *      trade after it was answered puts it back.
 *
 * ...and one way it stops waiting without being answered: the mentor set it
 * aside. `dismissedAt` is that timestamp, or null.
 *
 * A DISMISSAL EXPIRES. If it did not, it would be a silencer - the member asks
 * a follow-up on a trade set aside last month and nobody ever sees it. So it
 * only counts while it is newer than everything the member has done since:
 * their last edit, and their last message. Nothing has to clear it up; a stale
 * dismissal is an old timestamp that loses every comparison.
 *
 * `msgs` must be newest first, which is how every caller queries it.
 */
export function isWaitingForMentor(trade, msgs, dismissedAt) {
  const list = msgs || [];
  const memberLast = list.find((m) => fromMember(m, trade));

  // Set aside, and the member has not touched it since.
  if (dismissedAt) {
    const aside = new Date(dismissedAt);
    const since = [trade.updated_at, memberLast && memberLast.created_at]
      .filter(Boolean)
      .map((v) => new Date(v));
    if (since.every((t) => aside >= t)) return false;
  }

  if (!list.length) return true;
  if (fromMember(list[0], trade)) return true;

  const newestMentor = list.find((m) => !fromMember(m, trade));
  if (!newestMentor) return true;
  return !trade.updated_at ||
         new Date(newestMentor.created_at) < new Date(trade.updated_at);
}

/**
 * Set aside, and still set aside.
 *
 * Told apart from "answered" because they are different facts and the page
 * says so. A trade can be both - answered, then set aside after a follow-up -
 * and in that case the dismissal is what is keeping it out of the queue, so
 * that is what gets reported.
 */
export function isSetAside(trade, msgs, dismissedAt) {
  if (!dismissedAt) return false;
  const list = msgs || [];
  const memberLast = list.find((m) => fromMember(m, trade));
  const aside = new Date(dismissedAt);
  return [trade.updated_at, memberLast && memberLast.created_at]
    .filter(Boolean)
    .map((v) => new Date(v))
    .every((t) => aside >= t);
}

/**
 * How many shared trades are waiting on the mentor.
 *
 * Two queries rather than a view, deliberately. A view would be one round trip
 * and would also be a migration to run before the badge worked at all - and
 * this is a number in a masthead, not a report. The rule above is shared, so
 * the thing a view would really have bought (one definition) is already had.
 *
 * Returns 0 rather than throwing on any failure. A badge that cannot be
 * computed must not take the masthead down with it.
 */
export async function countWaitingReviews() {
  if (!supabase) return 0;
  try {
    const { data: trades, error } = await supabase
      .from('trades')
      .select('id, user_id, updated_at')
      .eq('shared_with_mentor', true)
      .limit(1000);

    if (error || !trades || !trades.length) return 0;

    const { data: msgs } = await supabase
      .from('trade_reviews')
      .select('trade_id, author_id, created_at')
      .in('trade_id', trades.map((t) => t.id))
      .order('created_at', { ascending: false });

    const byTrade = new Map();
    for (const m of msgs || []) {
      if (!byTrade.has(m.trade_id)) byTrade.set(m.trade_id, []);
      byTrade.get(m.trade_id).push(m);
    }

    /* Dismissals, and a failure here must not inflate the badge.
     *
     * If this table is missing - the migration has not been run - the query
     * errors and `aside` stays empty, so every set-aside trade counts as
     * waiting again. That is the right way round: the badge over-reports and
     * the mentor finds a trade they thought they had dealt with, rather than
     * under-reporting and hiding one nobody has answered. */
    const aside = new Map();
    const { data: dropped } = await supabase
      .from('trade_review_dismissals')
      .select('trade_id, dismissed_at')
      .in('trade_id', trades.map((t) => t.id));

    for (const d of dropped || []) aside.set(d.trade_id, d.dismissed_at);

    return trades.filter((t) =>
      isWaitingForMentor(t, byTrade.get(t.id), aside.get(t.id))).length;
  } catch (err) {
    return 0;
  }
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

/**
 * One decision, however many accounts hold it.
 *
 * A member running copied prop accounts places one trade and it lands in every
 * account at once. Money must stay pooled - eighteen accounts really did make
 * eighteen lots of money - but anything that COUNTS or SEQUENCES has to
 * collapse, or the page claims eighteen times the evidence it has.
 *
 * Two rows are one decision when every fact about the trade matches. Two
 * genuinely separate trades at the same instant, same instrument, same
 * direction and the same prices collapse too. That is the right way round:
 * treating copies as independent inflates confidence, and this errs toward
 * less.
 */
export function distinctDecisions(list) {
  const seen = new Map();
  for (const r of list) {
    const key = [r.opened_at, r.symbol, r.direction, r.entry, r.exit_price,
                 r.contracts].join('|');
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
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
  // Above the prop_accounts rule, which would otherwise claim these: the error
  // text names the table, and the table is older than the columns.
  [/payout_threshold|payout_min_days|payout_day_min|lock_at|from_account/i,
                                         'supabase/funded-accounts.sql'],
  [/prop_accounts|prop_presets/i,        'supabase/prop-accounts.sql'],
  [/chart_url/i,                         'supabase/trade-chart-url.sql'],
  [/closed_at/i,                         'supabase/trade-closed-at.sql'],
  [/prop_attempts/i,                     'supabase/prop-attempts.sql'],
  // Above the loose /trades/i rule. It would not have matched anyway -
  // "trade_reviews" does not contain "trades" - which is exactly why this list
  // missed it and the reply box reported a bare schema-cache error with no file
  // to run. A table added without a line here fails silently in the one way
  // this function exists to prevent.
  [/trade_reviews/i,                     'supabase/trade-reviews.sql'],
  [/last_seen_at/i,                      'supabase/member-last-seen.sql'],
  [/risk_settings/i,                     'supabase/risk-settings.sql'],
  [/\btrade_exits\b/i,                       'supabase/trade-exits.sql'],
  [/\b(account|net_pnl)\b/i,                 'supabase/trade-accounts.sql'],
  [/\bfees\b/i,                              'supabase/trade-exits.sql'],
  [/\bsettings\b/i,                          'supabase/settings.sql'],
  [/\bscripts\b/i,                           'supabase/scripts.sql'],
  [/\blesson_links\b|\bvideo_url\b/i,        'supabase/lesson-media.sql'],
  [/\bphase_id\b|\bphases\b/i,              'supabase/phases.sql'],
  [/\btrades\b/i,                            'supabase/trades.sql']
];

export function migrationHint(error) {
  const raw = error && error.message ? error.message : String(error ?? '');

  // Not a missing object at all: the index exists but was created partial, so
  // an upsert cannot address it. Named separately because the message says
  // nothing about which table it happened on.
  if (/ON CONFLICT specification/i.test(raw)) return 'supabase/trade-import-fix.sql';

  // Also not a missing object: the table is there and the policy that would
  // have allowed the write is not. Named here rather than in the table below
  // because the table is only consulted for missing objects, and because the
  // right file is a different one - trade_reviews has existed since a mentor
  // could reply, so pointing at trade-reviews.sql would send somebody to re-run
  // a migration that changes nothing and make the advice look wrong.
  //
  // Only trade_reviews. Every other RLS refusal on this site means the policies
  // are doing their job, and offering a file to run would read as an
  // instruction to disable them.
  if (/row-level security/i.test(raw) && /trade_reviews/i.test(raw)) {
    return 'supabase/trade-reviews-thread.sql';
  }

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
/* -------------------------------- paging ---------------------------------
 *
 * Three pages render a list long enough that the thing you came for is a
 * thousand pixels below the thing you are looking at. The journal draws five
 * hundred trades, the calendar draws every day of a month, and the prop page
 * draws a card per account - which is sixteen for anybody running copied
 * evaluations, and sixteen tall cards is a lot of wheel.
 *
 * Deliberately not infinite scroll. A page number can be returned to, said out
 * loud, and left; a scroll position cannot, and "it was somewhere near the
 * middle" is not a way to find a trade.
 */

const PAGE_SIZES = [25, 50, 100, 150, 200];

/* A list of rows and a list of cards are not the same problem.
 *
 * Twenty-five journal rows is a screen and a half. Twenty-five prop cards is a
 * minute of scrolling, and there is no page size in the list above that helps,
 * because seventeen accounts fit inside the smallest one - the pager renders, it
 * says "1-17 of 17", and the scroll is exactly as long as it was. A page size
 * has to be smaller than the list before paging means anything.
 *
 * So a caller whose rows are tall passes its own steps. */
export const CARD_SIZES = [5, 10, 25, 50, 100, 150, 200];

/**
 * How many rows a page shows, remembered per list.
 *
 * Kept in localStorage rather than in the database: it is a property of the
 * screen being read on, not of the member. Somebody who sets 200 on a desktop
 * has said nothing about what they want on a phone, and syncing it would make
 * that choice follow them somewhere it does not fit.
 */
export function pageSize(key, fallback = 50, sizes = PAGE_SIZES) {
  const raw = Number(localStorage.getItem('tk-page-' + key));
  return sizes.includes(raw) ? raw : fallback;
}

export function setPageSize(key, value) {
  localStorage.setItem('tk-page-' + key, String(value));
}

/**
 * The slice of `items` belonging to `page`, and the page actually used.
 *
 * Clamped, because a page number can outlive the list that justified it: filter
 * a journal down while sitting on page 7 and the honest answer is the last page
 * that exists, not an empty one with no way back.
 */
export function pageSlice(items, page, per) {
  const pages = Math.max(1, Math.ceil(items.length / per));
  const current = Math.min(Math.max(1, page), pages);
  const from = (current - 1) * per;
  return { rows: items.slice(from, from + per), page: current, pages, from, total: items.length };
}

/**
 * The control strip. Renders nothing at all when everything already fits -
 * a pager under a list of nine is furniture.
 */
export function renderPager(selector, state, onChange, sizes = PAGE_SIZES) {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!el) return;

  const { page, pages, from, rows, total } = state;

  /* Hidden only when no page size on offer could split this list.
   *
   * The first rule was "hide it when everything fits on one page", which is
   * defensible and was wrong: seventeen prop accounts fit inside a page of
   * twenty-five, so the control vanished on the page whose cards are tallest
   * and whose scroll was the original complaint. Fitting on one page at the
   * CURRENT size says nothing about whether somebody wants a smaller one.
   *
   * The replacement was a flat threshold of ten, which was wrong in the other
   * direction: it showed a pager that could not shorten anything, because the
   * smallest size on offer was still larger than the list.
   *
   * Asking the sizes settles it. Above the smallest step the control does
   * something, so it earns its place even on one page; at or below it there is
   * nothing it could do, so it is furniture. */
  if (pages <= 1 && total <= Math.min(...sizes)) { el.innerHTML = ''; return; }

  const btn = (label, to, disabled, current) =>
    '<button type="button" class="pager-btn' + (current ? ' is-current' : '') + '"' +
    (disabled ? ' disabled' : '') + ' data-page="' + to + '">' + label + '</button>';

  // First, last, and a window either side of where you are. A list of forty
  // pages rendered in full is its own scrolling problem.
  const nums = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '...') nums.push('...');
  }

  el.className = 'pager';
  el.innerHTML =
    '<span class="pager-count">' +
      (total ? (from + 1) + '-' + (from + rows.length) + ' of ' + total : '0') +
    '</span>' +
    '<span class="pager-pages">' +
      btn('&larr;', page - 1, page <= 1, false) +
      nums.map((n) => n === '...'
        ? '<span class="pager-gap">&hellip;</span>'
        : btn(String(n), n, false, n === page)).join('') +
      btn('&rarr;', page + 1, page >= pages, false) +
    '</span>' +
    '<label class="pager-size">Per page ' +
      '<select class="role-select">' +
        sizes.map((n) => '<option value="' + n + '"' +
          (n === state.per ? ' selected' : '') + '>' + n + '</option>').join('') +
      '</select></label>';

  el.querySelectorAll('[data-page]').forEach((b) => {
    b.addEventListener('click', () => onChange({ page: Number(b.getAttribute('data-page')) }));
  });
  const sel = el.querySelector('select');
  if (sel) sel.addEventListener('change', () => onChange({ per: Number(sel.value), page: 1 }));
}

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
/* The members' message of the day.
 *
 * A key in `settings` rather than a table of its own. There is one of them, it
 * is a string, and settings.sql says outright that is what it is for: values
 * where a table per setting would be worse than the setting.
 *
 * Named here rather than typed as a literal in two files. A key spelled one way
 * on the page that writes it and another on the page that reads it is a notice
 * that silently never appears, and nothing about that failure points at the
 * spelling. */
export const MOTD_KEY = 'members_motd';

/* Has this member already dismissed THIS notice?
 *
 * Keyed on a fingerprint of the notice text, not on a bare "dismissed" flag.
 * A flag would mean posting a new notice and having it seen only by people who
 * had never closed the previous one - which is the failure that makes a notice
 * system worthless, and it fails silently: the admin sees their notice, because
 * they never dismissed anything.
 *
 * Change one character and the fingerprint changes, so the notice is new again
 * for everybody.
 *
 * One fingerprint is stored per member, not a list, so reverting to an earlier
 * wording does NOT restore the dismissal - it reads as new, because it is not
 * the notice they last closed. That is the right way round: a notice nobody has
 * dismissed showing is a nuisance, and one nobody sees is a failure.
 *
 * IN localStorage RATHER THAN THE DATABASE, and that is a trade rather than an
 * oversight. It costs a column, a policy and a write on every page load to make
 * "I have read this" follow somebody between their laptop and their phone, and
 * a notice is not worth that. The cost of being wrong is seeing a notice twice.
 *
 * Keyed by user id as well, because two accounts share a browser more often
 * than is comfortable - the same reason touchLastSeen is.
 */
const MOTD_SEEN_KEY = 'motd_dismissed';

/* A cheap, stable fingerprint. Not a hash for any security purpose - it only
 * has to change when the text does, and be the same on every machine. */
export function fingerprint(text) {
  const s = String(text == null ? '' : text);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function motdDismissed(userId, text) {
  try {
    return localStorage.getItem(MOTD_SEEN_KEY + ':' + userId) === fingerprint(text);
  } catch (err) {
    // Private browsing has no localStorage. Showing the notice is the right
    // way to be wrong.
    return false;
  }
}

export function dismissMotd(userId, text) {
  try {
    localStorage.setItem(MOTD_SEEN_KEY + ':' + userId, fingerprint(text));
  } catch (err) { /* nothing to do, and nothing worth saying */ }
}

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

/* ---------------------------- charts, by link -----------------------------
 *
 * A member looking at a trade is already looking at a chart. Alt+S in
 * TradingView turns that into a link, and the image behind the link is at a
 * URL derived from the id - first character of the id as the folder:
 *
 *     https://www.tradingview.com/x/m7azfyek/
 *     https://s3.tradingview.com/snapshots/m/m7azfyek.png
 *
 * So one paste gets both the durable link and something renderable, with no
 * upload, no bucket and nothing of theirs stored anywhere.
 *
 * Any https link is accepted, not only TradingView. Somebody hosting a chart
 * elsewhere should not be told their screenshot is the wrong brand; they get
 * the link, and an inline image too if the URL is one we can recognise.
 */

const TV_SNAPSHOT = /^https?:\/\/(?:[a-z-]+\.)?tradingview\.com\/x\/([A-Za-z0-9]+)\/?/;
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i;

/**
 * Split a pasted chart link into what to link to and what to show.
 *
 * Returns null for anything that is not an http(s) URL, so a half-typed
 * address renders as nothing rather than as a broken image.
 */
export function chartLink(raw) {
  const url = String(raw || '').trim();
  if (!url) return null;

  let parsed;
  try { parsed = new URL(url); } catch (err) { return null; }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const tv = url.match(TV_SNAPSHOT);
  if (tv) {
    const id = tv[1];
    return {
      href: 'https://www.tradingview.com/x/' + id + '/',
      image: 'https://s3.tradingview.com/snapshots/' + id[0].toLowerCase() + '/' + id + '.png',
      host: 'TradingView'
    };
  }

  // Anywhere else: linkable always, previewable only when the URL is plainly
  // an image. Guessing at a page and rendering it as an <img> produces a
  // broken-image icon, which reads as a bug rather than as a link.
  return {
    href: url,
    image: IMAGE_FILE.test(parsed.pathname) ? url : null,
    host: parsed.hostname.replace(/^www\./, '')
  };
}

/* ------------------------- the journal, on a chart -------------------------
 *
 * The wire format read by `trade-karma-my-trades.pine` in the private repo.
 * Nine comma-separated fields per trade, semicolons between:
 *
 *     symbol,openMs,L|S,entry,stop,target,exit,closeMs,R
 *     NQ,1754994600000,L,18422.25,18410,18460,18432.5,1754995440000,0.84
 *
 * TWO REPOSITORIES HAVE TO AGREE ABOUT THIS. Changing the field order here
 * silently mis-draws every trade on somebody's chart: the indicator has no way
 * to tell a stop from a target, so a wrong order is not an error, it is a
 * plausible picture of a trade that never happened. Change the Pine first.
 *
 * Timestamps go out as UTC milliseconds rather than as a written date, because
 * a date needs a timezone to mean anything and the chart's, the exchange's and
 * the member's are three different answers. An epoch is the same instant
 * everywhere, which is what is wanted for something being lined up with a bar.
 *
 * Oldest first, because the indicator's cap keeps the tail.
 */

/** Numbers only, and nothing that could pass for a separator. */
function pineNum(value) {
  const n = toNumber(value);
  return Number.isFinite(n) ? String(n) : '';
}

export function toPineTrades(list) {
  const rows = (list || [])
    .map((r) => ({ r, at: Date.parse(r.opened_at) }))
    .filter((x) => Number.isFinite(x.at))
    .sort((a, b) => a.at - b.at);

  return rows.map(({ r, at }) => {
    const closed = Date.parse(r.closed_at);
    return [
      // Anything that is not a letter or a digit comes out. A symbol carrying
      // a comma would shift every field after it by one, and the indicator
      // would draw the result rather than refuse it.
      String(r.symbol || 'NQ').replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
      String(at),
      r.direction === 'short' ? 'S' : 'L',
      pineNum(r.entry),
      pineNum(r.stop),
      pineNum(r.target),
      pineNum(r.exit_price),
      Number.isFinite(closed) ? String(closed) : '',
      pineNum(r.r_multiple)
    ].join(',');
  }).join(';\n');
}

/**
 * Put text on the clipboard, with somewhere to go when that is not allowed.
 *
 * The Clipboard API needs a secure context, which a file:// page is not, and
 * a prompt box is copyable by hand. Silently failing to copy is the one
 * outcome worth ruling out: nothing appears to happen, and the paste that
 * follows is whatever was on the clipboard before.
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    window.prompt('Copy this:', text);
    return false;
  }
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

/* --------------------------------- faces ---------------------------------
 *
 * A picture beside a name, or initials when there is no picture.
 *
 * INITIALS ARE THE DEFAULT, NOT THE FALLBACK, and the difference matters. A
 * member who uploads nothing still has a face on every page they appear on, so
 * there is no empty circle to explain, no "add a photo" nag, and no layout that
 * shifts when somebody finally does. Uploading changes what is in the circle,
 * not whether there is one.
 */

/** Up to two letters, from a name if there is one and an email if there is not. */
export function initialsOf(nameOrEmail) {
  const raw = String(nameOrEmail || '').trim();
  if (!raw) return '?';

  // An email is not a name. Everything after the @ is a company, and the local
  // part is usually the closest thing to a person in it.
  const base = raw.includes('@') ? raw.split('@')[0] : raw;
  const words = base.split(/[\s._-]+/).filter(Boolean);

  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/* One of eight hues, chosen from the id.
 *
 * From the ID rather than the name, so renaming yourself does not change your
 * colour - the colour is a weak identity cue and one that moves is worse than
 * none. Deterministic, so every page and every browser agrees without storing
 * anything.
 *
 * Eight rather than a full spectrum: hues picked at random collide with the
 * brand red and with the bull/bear pair, and a member whose circle happens to
 * be the losing colour reads as something. These are spaced away from both.
 */
const FACE_HUES = [210, 260, 190, 280, 160, 230, 300, 175];

export function faceHue(id) {
  const key = String(id || '');
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum = (sum + key.charCodeAt(i) * (i + 1)) % 9973;
  return FACE_HUES[sum % FACE_HUES.length];
}

/**
 * The markup for one face.
 *
 * `url` is a signed link when the member has a picture and the caller has
 * already minted one - avatars live in a private bucket, so a page that wants
 * pictures has to sign them, and a page that does not care can pass nothing and
 * still get initials.
 *
 * The image sits ON TOP of the initials rather than instead of them, so a
 * signed link that has expired, or a bucket that is briefly unreachable,
 * degrades to a letter rather than to a broken-image icon.
 */
export function faceHtml(person, url, size) {
  const name = (person && (person.full_name || person.email)) || '';
  const hue = faceHue(person && person.id);
  const cls = 'face' + (size ? ' face--' + size : '');

  return '<span class="' + cls + '" style="--face-hue:' + hue + '" ' +
      'title="' + escapeHtml(name) + '" aria-hidden="true">' +
    escapeHtml(initialsOf(name)) +
    (url ? '<img src="' + escapeHtml(url) + '" alt="" loading="lazy">' : '') +
  '</span>';
}

/** Where a member's own picture goes. One folder each, enforced by policy. */
export function avatarFolder(userId) {
  return 'avatars/' + userId + '/';
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
