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

/** The signed-in user, or null. */
export async function getUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
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

  const profile = await getProfile();

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
    el.innerHTML = '<span class="acct-muted">auth not configured</span>';
    return;
  }

  const profile = await getProfile();

  if (!profile) {
    el.innerHTML = '<a class="acct-link" href="login.html">sign in</a>';
    return;
  }

  const adminLink = profile.role === 'admin'
    ? '<a class="acct-link" href="admin.html">admin</a>'
    : '';

  el.innerHTML =
    '<span class="acct-muted">' + escapeHtml(profile.email) + '</span>' +
    '<span class="role-badge role-' + escapeHtml(profile.role) + '">' + escapeHtml(profile.role) + '</span>' +
    adminLink +
    '<button type="button" class="acct-link" id="sign-out">sign out</button>';

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
