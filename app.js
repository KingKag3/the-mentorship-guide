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

/* --------------------------------- tools --------------------------------- */

/**
 * The one list of tools. Every page that shows them renders from here, because
 * three pages had already drifted into three different hand-written link rows
 * and a fourth was about to.
 */
export const TOOLS = [
  { href: 'journal.html', name: 'Journal',
    blurb: 'Log a trade against the vocabulary you are being taught. Private to you.' },
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
