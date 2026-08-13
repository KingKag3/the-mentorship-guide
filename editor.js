/* The reply editor: Editor.js, loaded on demand, stored as its own JSON.
 *
 * ============================================================================
 * WHAT CHANGED, AND WHAT DID NOT
 * ============================================================================
 *
 * This was a hand-written contenteditable that serialised to Markdown. It is
 * now codex-team/editor.js, a block editor, loaded from a CDN as ES modules
 * exactly the way Supabase and Quill already are - there is still no build step
 * and no node_modules.
 *
 * The security property is unchanged, because it never depended on Markdown.
 * The rule is: NOTHING A PERSON WROTE REACHES innerHTML AS MARKUP. Editor.js
 * saves a JSON document rather than an HTML string, which is the same kind of
 * guarantee from a different direction - the column holds data, and this file
 * decides what tags that data may become.
 *
 * That still needs enforcing rather than assuming, and here is why it is not
 * paranoia. Editor.js stores the inline formatting inside a block as an HTML
 * fragment: `{ "text": "the <b>stop</b>" }`. Editor.js itself only ever writes
 * <b>, <i>, <a>, <code> and <mark> there - but Editor.js is not what sends the
 * row. The browser is, and the member owns the browser. Anyone can post
 * `{"blocks":[{"type":"paragraph","data":{"text":"<img src=x onerror=...>"}}]}`
 * straight to PostgREST with their own key. So the fragment is parsed and
 * re-emitted through the whitelist in safeInline() below, and the whitelist -
 * not the editor - is what makes it safe.
 *
 * This matters more here than almost anywhere on the site: a member's message
 * renders inside admin.html, the one session that can read every shared trade,
 * write as the mentor, and change roles.
 *
 * ============================================================================
 * WHY IT LOADS LATE
 * ============================================================================
 *
 * The library and its three tools are eight requests and take roughly two
 * seconds to reach `isReady` on a cold cache. The Review tab shows ten cards,
 * each with a reply box, and the journal shows fifty rows. Mounting an editor
 * per box on render would be twenty seconds of work to display a page on which
 * nobody may type anything at all.
 *
 * So a box starts as a plain surface that looks like the editor and does
 * nothing. The real editor is mounted on the first click, into the same space.
 * The modules are also fetched during an idle moment after the page settles, so
 * by the time somebody clicks, the import is usually already in cache and the
 * swap is immediate.
 *
 * ============================================================================
 * READING OLD MESSAGES
 * ============================================================================
 *
 * Bodies written before today are plain text, and bodies written yesterday are
 * Markdown. Both still have to render, so renderBody() looks at what it was
 * given rather than assuming: JSON goes through the block renderer, anything
 * else through mdToHtml, which is kept for exactly that reason.
 */

import { escapeHtml } from './app.js';

/* Pinned, not floating.
 *
 * A range like ^2.31 would let a CDN hand this site a different editor on any
 * morning, with no diff, no commit and nobody having changed anything. That is
 * the failure mode a lockfile prevents in a project that has one; pinning is
 * how a project without a build step gets the same property. */
const CDN = 'https://esm.sh/';
const LIB = {
  core:       CDN + '@editorjs/editorjs@2.31.6',
  list:       CDN + '@editorjs/list@2.0.9',
  quote:      CDN + '@editorjs/quote@2.7.6',
  inlineCode: CDN + '@editorjs/inline-code@1.5.2'
};

/* http and https only.
 *
 * The scheme is the whole attack in a link: javascript: in an href runs on
 * click, and data: can carry a document. Checked on the way out as well as the
 * way in, because a row could have been written before any check existed. */
const SAFE_SCHEME = /^https?:\/\//i;

/* The inline whitelist. Tag in, tag out - anything else contributes its text
 * and nothing else, so there is no list of dangerous elements to keep current.
 * <mark> is here because Editor.js can emit it and dropping the tag silently
 * would lose a highlight somebody meant. */
const INLINE_OK = {
  b: 'strong', strong: 'strong',
  i: 'em', em: 'em',
  code: 'code',
  mark: 'mark',
  a: 'a',
  br: 'br'
};


/* ==========================================================================
 * Rendering a saved message
 * ========================================================================== */

/**
 * The one function the pages call to display a message body.
 *
 * Accepts an Editor.js document, a Markdown string, or the plain text that
 * predates both, and returns a safe HTML string in every case.
 */
export function renderBody(body) {
  const doc = asDocument(body);
  return doc ? blocksToHtml(doc.blocks) : mdToHtml(body);
}

/** Editor.js JSON, or null if this is not that. */
function asDocument(body) {
  const text = String(body == null ? '' : body).trim();
  // Cheap gate first: a Markdown reply almost never starts with a brace, and
  // JSON.parse on every message on a fifty-row page is not free.
  if (text.charAt(0) !== '{') return null;
  try {
    const doc = JSON.parse(text);
    return doc && Array.isArray(doc.blocks) ? doc : null;
  } catch (err) {
    return null;
  }
}

function blocksToHtml(blocks) {
  const out = [];

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const data = block.data || {};

    switch (block.type) {
      case 'paragraph': {
        const text = safeInline(data.text);
        if (text.trim()) out.push('<p>' + text + '</p>');
        break;
      }

      case 'list': {
        const tag = data.style === 'ordered' ? 'ol' : 'ul';
        const items = listItems(data.items, tag);
        if (items) out.push('<' + tag + '>' + items + '</' + tag + '>');
        break;
      }

      case 'quote': {
        const text = safeInline(data.text);
        if (!text.trim()) break;
        const caption = safeInline(data.caption);
        out.push('<blockquote><p>' + text + '</p>' +
          (caption.trim() ? '<footer>' + caption + '</footer>' : '') +
          '</blockquote>');
        break;
      }

      case 'header': {
        // Not an enabled tool, but a body could carry one - from a paste, or
        // from a future version of this page. Rendered as a bold line rather
        // than a heading: a reply about one trade has no outline, and an <h2>
        // in the middle of a thread would outrank the page's own headings.
        const text = safeInline(data.text);
        if (text.trim()) out.push('<p><strong>' + text + '</strong></p>');
        break;
      }

      default: {
        // An unknown block type keeps whatever text it carries rather than
        // vanishing. A message that silently renders as nothing is the worst
        // outcome here - worse than rendering plainly - because neither side
        // can tell it happened.
        const text = safeInline(data.text);
        if (text.trim()) out.push('<p>' + text + '</p>');
      }
    }
  }

  return out.join('');
}

/* Nested lists, flattened to one level.
 *
 * The list tool supports nesting and this deliberately does not reproduce it.
 * A nested list in a reply about a single trade is nearly always somebody's Tab
 * key; keeping the words at one level loses the indentation and nothing else,
 * and avoids a renderer that has to agree with itself about depth. */
function listItems(items, tag, into) {
  const out = into || [];
  if (!Array.isArray(items)) return into ? out : '';

  for (const item of items) {
    // The list tool changed shape between major versions: older documents hold
    // plain strings, newer ones hold { content, items }. Both are in the wild
    // and both have to render.
    const content = typeof item === 'string' ? item : (item && item.content);
    const text = safeInline(content);
    if (text.trim()) out.push('<li>' + text + '</li>');
    if (item && Array.isArray(item.items)) listItems(item.items, tag, out);
  }

  return into ? out : out.join('');
}

/**
 * Re-emit an inline HTML fragment through the whitelist.
 *
 * Parsed with a <template>, whose contents are an inert document fragment:
 * scripts do not run and images do not load while it is being walked. Then
 * every node is rebuilt rather than kept, so an attribute nobody thought of
 * cannot survive by being ignored.
 */
function safeInline(html) {
  const src = String(html == null ? '' : html);
  if (!src) return '';
  // No markup at all is the common case by a distance.
  if (src.indexOf('<') === -1 && src.indexOf('&') === -1) return escapeHtml(src);

  const holder = document.createElement('template');
  holder.innerHTML = src;
  return walkInline(holder.content);
}

function walkInline(parent) {
  let out = '';

  for (const node of parent.childNodes) {
    if (node.nodeType === 3) { out += escapeHtml(node.nodeValue); continue; }
    if (node.nodeType !== 1) continue;

    const tag = node.nodeName.toLowerCase();
    const keep = INLINE_OK[tag];

    if (!keep) {
      // Not on the list. Its text still counts, its element does not - so a
      // <script> contributes the characters inside it, escaped, and a <div>
      // contributes its words.
      if (tag !== 'script' && tag !== 'style') out += walkInline(node);
      continue;
    }

    if (keep === 'br') { out += '<br>'; continue; }

    if (keep === 'a') {
      const href = node.getAttribute('href') || '';
      const inner = walkInline(node);
      out += SAFE_SCHEME.test(href)
        ? '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' +
          inner + '</a>'
        // A refused scheme loses the link and keeps the words. Dropping the
        // text as well would hide that anything was said.
        : inner;
      continue;
    }

    // No attributes are copied. Editor.js writes class names on <code> and
    // <mark>; the stylesheet targets the tags, so the classes are not needed
    // and copying attributes is how style="" and on* get through.
    out += '<' + keep + '>' + walkInline(node) + '</' + keep + '>';
  }

  return out;
}


/* ==========================================================================
 * Markdown, kept for the messages that predate Editor.js
 *
 * Not dead code and not a fallback nobody reaches: every reply written before
 * today is plain text or Markdown, and they are the only replies that exist.
 * ========================================================================== */

export function mdToHtml(src) {
  const lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const isQuote = (s) => /^\s{0,3}>\s?/.test(s);
  const isBullet = (s) => /^\s{0,3}[-+*]\s+/.test(s);
  const isNumber = (s) => /^\s{0,3}\d{1,9}[.)]\s+/.test(s);
  const isBlank = (s) => !s.trim();
  const starts = (s) => isQuote(s) || isBullet(s) || isNumber(s);

  while (i < lines.length) {
    if (isBlank(lines[i])) { i++; continue; }

    if (isQuote(lines[i])) {
      const held = [];
      while (i < lines.length && isQuote(lines[i])) {
        held.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i++;
      }
      out.push('<blockquote><p>' + held.map(inlineToHtml).join('<br>') + '</p></blockquote>');
      continue;
    }

    if (isBullet(lines[i]) || isNumber(lines[i])) {
      const ordered = isNumber(lines[i]);
      const items = [];
      while (i < lines.length &&
             (ordered ? isNumber(lines[i]) : isBullet(lines[i]))) {
        items.push(lines[i].replace(ordered ? /^\s{0,3}\d{1,9}[.)]\s+/
                                            : /^\s{0,3}[-+*]\s+/, ''));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push('<' + tag + '>' +
        items.map((t) => '<li>' + inlineToHtml(t) + '</li>').join('') +
        '</' + tag + '>');
      continue;
    }

    const held = [];
    while (i < lines.length && !isBlank(lines[i]) && !starts(lines[i])) {
      held.push(lines[i]);
      i++;
    }
    out.push('<p>' + held.map(inlineToHtml).join('<br>') + '</p>');
  }

  return out.join('');
}

/* One pass, left to right. A chain of regex replaces is the usual way to do
 * this and gets emphasis inside code spans wrong every time, because a replace
 * cannot see that it is inside something else. This can. */
function inlineToHtml(src) {
  let out = '';
  let i = 0;

  while (i < src.length) {
    const c = src[i];

    if (c === '\\' && i + 1 < src.length && '\\*`[]'.indexOf(src[i + 1]) !== -1) {
      out += escapeHtml(src[i + 1]);
      i += 2;
      continue;
    }

    if (c === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        out += '<code>' + escapeHtml(src.slice(i + 1, end)) + '</code>';
        i = end + 1;
        continue;
      }
    }

    if (c === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end > i + 1) {
        out += '<strong>' + inlineToHtml(src.slice(i + 2, end)) + '</strong>';
        i = end + 2;
        continue;
      }
    }

    if (c === '*') {
      const end = src.indexOf('*', i + 1);
      if (end > i + 1) {
        out += '<em>' + inlineToHtml(src.slice(i + 1, end)) + '</em>';
        i = end + 1;
        continue;
      }
    }

    if (c === '[') {
      const m = /^\[([^\]]*)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m) {
        out += SAFE_SCHEME.test(m[2])
          ? '<a href="' + escapeHtml(m[2]) + '" target="_blank" rel="noopener noreferrer">' +
            inlineToHtml(m[1]) + '</a>'
          : inlineToHtml(m[1]);
        i += m[0].length;
        continue;
      }
    }

    out += escapeHtml(c);
    i++;
  }

  return out;
}


/* ==========================================================================
 * Loading the library
 * ========================================================================== */

let loading = null;

/** Imported once per page, however many boxes ask for it. */
function loadLibrary() {
  if (!loading) {
    loading = Promise.all([
      import(/* @vite-ignore */ LIB.core).then((m) => m.default),
      import(/* @vite-ignore */ LIB.list).then((m) => m.default),
      import(/* @vite-ignore */ LIB.quote).then((m) => m.default),
      import(/* @vite-ignore */ LIB.inlineCode).then((m) => m.default)
    ]).then(([EditorJS, List, Quote, InlineCode]) =>
      ({ EditorJS, List, Quote, InlineCode }));

    // A failed import must not poison every later attempt. Clearing the cached
    // promise means the next click tries again rather than reporting a failure
    // that happened once, offline, minutes ago.
    loading.catch(() => { loading = null; });
  }
  return loading;
}

/**
 * Fetch the modules during an idle moment.
 *
 * Called once by each page that has reply boxes. Nothing waits on it: it turns
 * the two-second first click into an instant one when it works, and changes
 * nothing when it does not.
 */
export function warmEditor() {
  const go = () => { loadLibrary().catch(() => {}); };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 4000 });
  else setTimeout(go, 2000);
}


/* ==========================================================================
 * The editor
 * ========================================================================== */

/**
 * Turn `host` into a reply box.
 *
 * Returns { getBody, clear, focus, setDisabled, isEmpty, destroy }.
 *
 * getBody is async and returns a JSON string, or '' when nothing was written.
 * The caller never touches what is inside, which is the point: the only text
 * that can be saved is text this file produced.
 */
export function mountEditor(host, opts = {}) {
  const placeholder = opts.placeholder || '';
  const label = opts.label || 'Message';

  host.classList.add('rte');
  host.innerHTML =
    '<div class="rte-shell" role="textbox" tabindex="0" ' +
      'aria-label="' + escapeHtml(label) + '">' +
      '<span class="rte-hint">' + escapeHtml(placeholder) + '</span>' +
    '</div>';

  let editor = null;      // the Editor.js instance, once mounted
  let starting = null;    // the promise that is mounting it
  let disabled = false;

  /* The first click swaps the dummy surface for the real editor.
   *
   * mousedown rather than click, so the import starts on the way down and has
   * a few more milliseconds before anyone notices. */
  const begin = () => {
    if (editor || starting || disabled) return starting;

    const shell = host.querySelector('.rte-shell');
    if (shell) shell.classList.add('is-waiting');

    starting = loadLibrary().then(({ EditorJS, List, Quote, InlineCode }) => {
      host.innerHTML = '<div class="rte-body"></div>';

      const holder = host.querySelector('.rte-body');
      const instance = new EditorJS({
        holder,
        placeholder,
        minHeight: 0,          // the default reserves 300px of empty page
        autofocus: true,
        tools: {
          list:       { class: List, inlineToolbar: true },
          quote:      { class: Quote, inlineToolbar: true },
          inlineCode: { class: InlineCode }
        },
        // Editor.js logs its version banner to the console on every mount.
        // Fifty of those buries anything worth reading.
        logLevel: 'ERROR'
      });

      return instance.isReady.then(() => {
        editor = instance;
        starting = null;
        return instance;
      });
    }).catch((err) => {
      starting = null;
      // Say so in place rather than leaving a box that swallows clicks. An
      // editor that never appears is indistinguishable from a broken page,
      // and the cause - a CDN that did not answer - is worth naming.
      host.innerHTML =
        '<p class="field-note-bad">The editor could not be loaded. ' +
        'Check the connection and reload the page.</p>';
      throw err;
    });

    return starting;
  };

  host.addEventListener('mousedown', begin);
  host.addEventListener('focusin', begin);
  host.addEventListener('keydown', (e) => {
    // The dummy surface is focusable, so it has to open on Enter or Space the
    // way the thing it is standing in for would.
    if (!editor && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); begin(); }
  });

  const save = async () => {
    if (starting) { try { await starting; } catch (err) { return null; } }
    if (!editor) return null;
    try { return await editor.save(); } catch (err) { return null; }
  };

  return {
    element: host,

    /** JSON for the database, or '' when nothing worth sending was written. */
    getBody: async () => {
      const doc = await save();
      if (!doc || !doc.blocks || !doc.blocks.length) return '';
      // Editor.js keeps an empty paragraph for the caret to live in, so
      // "has blocks" is not the same as "has words". Rendering the document
      // and asking whether anything came out is the same test the reader
      // will apply.
      const rendered = blocksToHtml(doc.blocks).replace(/<[^>]*>/g, '').trim();
      if (!rendered) return '';
      return JSON.stringify({ blocks: doc.blocks, version: doc.version });
    },

    isEmpty: async () => {
      const doc = await save();
      if (!doc || !doc.blocks) return true;
      return !blocksToHtml(doc.blocks).replace(/<[^>]*>/g, '').trim();
    },

    clear: () => { if (editor) editor.blocks.clear(); },

    focus: () => {
      if (editor) { try { editor.focus(true); } catch (err) { /* not ready */ } }
      else begin();
    },

    setDisabled: (off) => {
      disabled = !!off;
      host.classList.toggle('is-disabled', disabled);
      if (editor && editor.readOnly) {
        // toggle() rejects if the editor is mid-render; a reply box that
        // cannot be greyed out is not worth failing a send over.
        editor.readOnly.toggle(disabled).catch(() => {});
      }
    },

    /* Editor.js attaches listeners outside its holder - the inline toolbar and
     * the block menu are appended to the body - so dropping the element is not
     * enough to clean it up. Both pages replace innerHTML wholesale on every
     * redraw, so this has to be called for each editor first. */
    destroy: () => {
      const done = editor;
      editor = null;
      starting = null;
      if (done && typeof done.destroy === 'function') {
        try { done.destroy(); } catch (err) { /* already gone */ }
      }
    }
  };
}
