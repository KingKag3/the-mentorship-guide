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
    if (mount) {
      mount.innerHTML = profile.role === 'pending'
        ? '<div class="callout warn"><span class="callout-label">Awaiting approval</span>' +
          '<p>Your account was created but has not been approved yet. An administrator has to ' +
          'let you in before the members area opens. You will not be emailed automatically — ' +
          'check back later.</p></div>'
        : '<div class="callout risk"><span class="callout-label">Not permitted</span>' +
          '<p>This page requires a different account level. You are signed in as <code>' +
          escapeHtml(profile.email) + '</code> with the role <code>' + escapeHtml(profile.role) +
          '</code>.</p></div>';
    }
    return null;
  }

  return profile;
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
