/* A small rich-text editor, and the two conversions either side of it.
 *
 * ============================================================================
 * WHY NOT STORE THE HTML
 * ============================================================================
 *
 * The obvious rich-text editor is a contenteditable whose innerHTML goes
 * straight into the database and comes straight back out. On most sites that
 * is merely risky. Here it would be a privilege escalation.
 *
 * trade_reviews now has two writers. A member's message renders inside the
 * ADMIN page - the one holding every grant on the site - so HTML written by a
 * member would execute in the mentor's session. Not a defaced page: an
 * attacker with the mentor's session can read every shared trade, write as the
 * mentor, and change roles.
 *
 * The usual answer is a sanitiser. A sanitiser is a blacklist, it is somebody
 * else's dependency, and CLAUDE.md says security here is Postgres policies and
 * never JavaScript. So this takes the other road:
 *
 *   - the editor is WYSIWYG on screen, and its DOM is never saved;
 *   - on save the DOM is walked and turned into Markdown, keeping only the
 *     handful of things below and silently dropping everything else. It is a
 *     whitelist by construction - an unrecognised node contributes its text and
 *     nothing else, so there is no "did we remember to strip that" question;
 *   - on render the Markdown is turned back into HTML by this file, where every
 *     tag is one this file wrote and every piece of user text goes through
 *     escapeHtml first.
 *
 * The database therefore holds text. Nothing already stored can become
 * executable, and the plain-text messages written before this existed render
 * unchanged - which is the other reason for Markdown over a JSON document
 * model.
 *
 * ============================================================================
 * WHAT IS SUPPORTED, AND WHY IT IS SO LITTLE
 * ============================================================================
 *
 * Bold, italic, inline code, links, bullet and numbered lists, block quotes.
 *
 * That is the whole vocabulary of a trade critique. Colours, fonts and sizes
 * are deliberately absent: they would let one person's message override the
 * page's own type scale, and CLAUDE.md's one-stylesheet rule exists precisely
 * so nothing can do that. Headings are absent because a two-paragraph reply
 * does not need an outline.
 *
 * ============================================================================
 * execCommand
 * ============================================================================
 *
 * Deprecated, and used anyway. It is the only way to get real WYSIWYG editing
 * without a framework, it works in every browser this site targets, and the
 * alternative is hand-writing selection and range surgery - far more code, and
 * far more of it wrong.
 *
 * Its output is inconsistent between browsers: <b> in one and <strong> in
 * another, <div> here and <p> there, sometimes a bare style attribute. That
 * does not matter, because nothing downstream reads this DOM except the
 * serialiser below, and the serialiser reads MEANING - is this bold - rather
 * than tag names. If execCommand is ever removed, only mountEditor changes.
 */

import { escapeHtml } from './app.js';

/* http and https only.
 *
 * The scheme is the whole attack in a link: javascript: in an href runs on
 * click, and data: can carry a document. Both are refused on the way in AND on
 * the way out, because a row could have been written before this check existed
 * or by something other than this editor. */
const SAFE_SCHEME = /^https?:\/\//i;

/* Characters that mean something in the Markdown produced here, escaped when
 * text is serialised so that typing an asterisk does not produce italics on
 * the way back. Underscore is deliberately NOT in the set - it is not
 * meaningful to the parser below, and escaping it would litter every
 * snake_case symbol somebody pastes in. */
const MD_SPECIAL = /([\\*`[\]])/g;

const BLOCKS = new Set(['p', 'div', 'ul', 'ol', 'blockquote', 'pre',
                        'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);


/* ==========================================================================
 * Reading a stored message
 *
 * Everything returns a STRING, because both pages build their rows by
 * concatenation and rewriting them to build DOM would be a large change to
 * code that works. That is safe here and only here: every tag in the output is
 * written by this file, and every character that came from a person passes
 * through escapeHtml. There is no path by which input becomes markup.
 * ========================================================================== */

/**
 * The one function the pages call to display a message body.
 *
 * Three formats reach this, and all three still have to render:
 *
 *   - Markdown, which is what this editor writes;
 *   - the plain text written before there was an editor at all;
 *   - an Editor.js document, from the afternoon this repo ran Editor.js for
 *     the reply box before moving back.
 *
 * The third is the reason renderBody exists rather than the pages calling
 * mdToHtml directly. It is a handful of rows at most and possibly none - but a
 * body that renders as a wall of raw JSON is worse than one that renders as
 * nothing, because it looks like the sender wrote it. See DECISIONS.md,
 * 13 August 2026, for why the swap happened and why it came back.
 */
export function renderBody(body, images) {
  const doc = asDocument(body);
  return doc ? blocksToHtml(doc.blocks) : mdToHtml(body, images);
}

/* Every image path a message refers to.
 *
 * The caller signs these and hands the map back to renderBody. A page that
 * does not call this - every page that renders a reply - passes nothing, and
 * nothing is what its images render as.
 */
export function imagePathsIn(src) {
  const out = [];
  const re = /!\[[^\]]*\]\(([^)\s]+)\)/g;
  let m;
  while ((m = re.exec(String(src == null ? '' : src)))) out.push(m[1]);
  return out;
}

/** An Editor.js document, or null if this is not one. */
function asDocument(body) {
  const text = String(body == null ? '' : body).trim();
  // Cheap gate first: a Markdown reply almost never opens with a brace, and
  // JSON.parse on every message of a fifty-row page is not free.
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

    if (block.type === 'list') {
      const tag = data.style === 'ordered' ? 'ol' : 'ul';
      const items = listItems(data.items);
      if (items) out.push('<' + tag + '>' + items + '</' + tag + '>');
      continue;
    }

    if (block.type === 'quote') {
      const text = safeInline(data.text);
      if (!text.trim()) continue;
      const caption = safeInline(data.caption);
      out.push('<blockquote><p>' + text + '</p>' +
        (caption.trim() ? '<footer>' + caption + '</footer>' : '') + '</blockquote>');
      continue;
    }

    // Paragraphs, headings, and any block type this never knew about. An
    // unknown type keeps its text rather than vanishing: a message that
    // silently renders as nothing is the worst outcome, because neither side
    // can tell it happened.
    const text = safeInline(data.text);
    if (text.trim()) {
      out.push(block.type === 'header'
        ? '<p><strong>' + text + '</strong></p>'
        : '<p>' + text + '</p>');
    }
  }

  return out.join('');
}

/* Nested lists flattened to one level, which keeps every word and loses only
 * the indentation. */
function listItems(items, into) {
  const out = into || [];
  if (!Array.isArray(items)) return into ? out : '';

  for (const item of items) {
    // The list tool changed shape between major versions: older documents hold
    // plain strings, newer ones hold { content, items }.
    const content = typeof item === 'string' ? item : (item && item.content);
    const text = safeInline(content);
    if (text.trim()) out.push('<li>' + text + '</li>');
    if (item && Array.isArray(item.items)) listItems(item.items, out);
  }

  return into ? out : out.join('');
}

/* Editor.js stores a block's inline formatting as an HTML fragment, and that
 * fragment was posted by somebody's browser - so it is parsed into an inert
 * <template>, where scripts do not run and images do not load, and every node
 * is REBUILT rather than kept. Tag in, tag out, no attributes copied. */
const INLINE_OK = { b: 'strong', strong: 'strong', i: 'em', em: 'em',
                    code: 'code', mark: 'mark', a: 'a', br: 'br' };

function safeInline(html) {
  const src = String(html == null ? '' : html);
  if (!src) return '';
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
        : inner;
      continue;
    }

    out += '<' + keep + '>' + walkInline(node) + '</' + keep + '>';
  }

  return out;
}


/* `images` is a Map of path -> signed URL, or absent.
 *
 * AN IMAGE RENDERS ONLY IF THE CALLER SUPPLIED A URL FOR ITS PATH, and that is
 * the whole security model rather than a convenience. The render site decides
 * whether pictures appear; the author does not.
 *
 * So a notice, rendered by a page that signed its paths first, shows images. A
 * member's reply, rendered by a page that passes nothing, cannot - not because
 * the syntax is stripped, but because there is no URL to point at. A member
 * writing `![](https://their-server/x.png)` into a reply gets the alt text and
 * the mentor's browser makes no request, which is the point: that request
 * would hand a stranger the mentor's IP and the moment they read it.
 *
 * External addresses never render at all. The map is keyed on our own bucket
 * paths, so there is nothing an arbitrary URL could match.
 */
export function mdToHtml(src, images) {
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
      out.push('<blockquote>' + para(held, images) + '</blockquote>');
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
        items.map((t) => '<li>' + inlineToHtml(t, images) + '</li>').join('') +
        '</' + tag + '>');
      continue;
    }

    // A paragraph runs until a blank line or the start of another block, so a
    // list written directly under a sentence is still a list.
    const held = [];
    while (i < lines.length && !isBlank(lines[i]) && !starts(lines[i])) {
      held.push(lines[i]);
      i++;
    }
    out.push('<p>' + held.map((t) => inlineToHtml(t, images)).join('<br>') + '</p>');
  }

  return out.join('');
}

function para(lines, images) {
  // Inside a quote, keep the line breaks rather than reflowing: somebody
  // quoting two lines of their own notes means two lines.
  return '<p>' + lines.map((t) => inlineToHtml(t, images)).join('<br>') + '</p>';
}

/* One pass, left to right. A regex-replace chain is the usual way to do this
 * and gets emphasis inside code spans wrong every time, because a replace
 * cannot see that it is inside something else. This can: a code span consumes
 * its own contents and hands back escaped text, so backticks win over
 * asterisks the way they should. */
function inlineToHtml(src, images) {
  let out = '';
  let i = 0;

  while (i < src.length) {
    const c = src[i];

    // A backslash before a special character makes it literal.
    if (c === '\\' && i + 1 < src.length && '\\*`[]'.indexOf(src[i + 1]) !== -1) {
      out += escapeHtml(src[i + 1]);
      i += 2;
      continue;
    }

    if (c === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        // Not recursed. Code means the characters as typed.
        out += '<code>' + escapeHtml(src.slice(i + 1, end)) + '</code>';
        i = end + 1;
        continue;
      }
    }

    if (c === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end > i + 1) {
        out += '<strong>' + inlineToHtml(src.slice(i + 2, end), images) + '</strong>';
        i = end + 2;
        continue;
      }
    }

    if (c === '*') {
      const end = src.indexOf('*', i + 1);
      if (end > i + 1) {
        out += '<em>' + inlineToHtml(src.slice(i + 1, end), images) + '</em>';
        i = end + 1;
        continue;
      }
    }

    /* An image: ![alt](path).
     *
     * Rendered ONLY when the caller supplied a URL for that exact path. No map,
     * or a path the map does not know, and the alt text is all that appears -
     * so a member writing this into a reply produces words, and their server is
     * never contacted. See the note on mdToHtml for why that matters.
     *
     * Checked before the link branch because `![x](y)` starts with `!` and the
     * link branch would otherwise take the `[x](y)` that follows it. */
    if (c === '!' && src[i + 1] === '[') {
      const m = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m) {
        const url = images && images.get ? images.get(m[2]) : null;
        /* data-path is written here as well as by the editor, and leaving it
         * out was a silent data loss: loading a notice for editing renders it
         * through this function, and the serialiser reads the path from the
         * attribute. Without it, opening a notice and pressing Save deleted
         * every picture in it - the request succeeded, and the images were
         * simply gone. */
        out += url
          ? '<img src="' + escapeHtml(url) + '" data-path="' + escapeHtml(m[2]) +
            '" alt="' + escapeHtml(m[1]) + '" loading="lazy">'
          : escapeHtml(m[1]);
        i += m[0].length;
        continue;
      }
    }

    if (c === '[') {
      const m = /^\[([^\]]*)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m) {
        if (SAFE_SCHEME.test(m[2])) {
          out += '<a href="' + escapeHtml(m[2]) + '" target="_blank" ' +
                 'rel="noopener noreferrer">' + inlineToHtml(m[1], images) + '</a>';
        } else {
          // A refused scheme loses the link and keeps the words. Dropping the
          // text as well would hide that something was said.
          out += inlineToHtml(m[1], images);
        }
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
 * DOM -> Markdown, for saving what was typed
 *
 * The whitelist. Anything not named here contributes its text and nothing
 * else, so a pasted table, a script tag or a styled span all reduce to the
 * words they contained.
 * ========================================================================== */

export function toMarkdown(root) {
  const out = [];
  let run = [];

  const flush = () => {
    if (!run.length) return;
    const text = run.map(inlineOf).join('').trim();
    if (text) out.push(text);
    run = [];
  };

  for (const node of root.childNodes) {
    const tag = node.nodeType === 1 ? node.nodeName.toLowerCase() : '';
    if (BLOCKS.has(tag)) {
      flush();
      const block = blockOf(node);
      if (block) out.push(block);
    } else {
      // Bare text and inline elements at the top level. Chrome leaves the
      // first line like this until something makes it wrap the line in a div.
      run.push(node);
    }
  }
  flush();

  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Does this element contain block-level children, rather than just inline? */
function wraps(node) {
  for (const kid of node.children) {
    if (BLOCKS.has(kid.nodeName.toLowerCase())) return true;
  }
  return false;
}

function blockOf(node) {
  const tag = node.nodeName.toLowerCase();

  if (tag === 'ul' || tag === 'ol') return listOf(node);

  if (tag === 'blockquote') {
    const inner = toMarkdown(node);
    if (!inner) return '';
    return inner.split('\n').map((l) => (l ? '> ' + l : '>')).join('\n');
  }

  /* A block that holds other blocks is a container, not a paragraph.
   *
   * This is not hypothetical tidiness. Selecting two paragraphs and pressing
   * the bullets button leaves Chrome with <p><ul>...</ul></p> - a list inside
   * a paragraph, which is not even valid HTML but is what the browser
   * produces. Reading that as a paragraph ran the items together into
   * "entry earlystop too tight": no separator, no list, and the words silently
   * joined. Recursing gets the list back. */
  if (wraps(node)) return toMarkdown(node);

  // Everything else block-shaped, headings included, becomes a paragraph. A
  // heading in a two-paragraph reply is somebody's browser being helpful, not
  // an outline.
  return [...node.childNodes].map(inlineOf).join('').trim();
}

/* A list, flattened.
 *
 * Nesting is deliberately not preserved. Indented Markdown lists are the
 * fiddliest part of any parser to get right, and a nested list in a reply
 * about one trade is somebody's Tab key rather than an intended outline. The
 * items survive at one level, which keeps every word; the indentation does
 * not. Losing a level of structure is a small price against a parser that
 * disagrees with itself about what "  - " means.
 */
function listOf(node, into) {
  const items = into || [];
  const ordered = node.nodeName.toLowerCase() === 'ol';

  for (const li of node.children) {
    if (li.nodeName.toLowerCase() !== 'li') continue;

    const nested = [];
    const parts = [];
    for (const kid of li.childNodes) {
      const tag = kid.nodeType === 1 ? kid.nodeName.toLowerCase() : '';
      if (tag === 'ul' || tag === 'ol') nested.push(kid);
      else parts.push(inlineOf(kid));
    }

    // One line per item. A break inside one would read as a new item on the
    // way back, so it becomes a space.
    const text = parts.join('').replace(/\s+/g, ' ').trim();
    if (text) items.push({ ordered, text });
    for (const sub of nested) listOf(sub, items);
  }

  if (into) return items;

  // Numbered from one over the flattened result, so an ordered list that had a
  // nested list in the middle still counts 1, 2, 3 rather than restarting.
  let n = 0;
  return items.map((item) => {
    if (!item.ordered) return '- ' + item.text;
    n++;
    return n + '. ' + item.text;
  }).join('\n');
}

function inlineOf(node) {
  if (node.nodeType === 3) {
    // A newline inside HTML is whitespace, not a line break.
    return node.nodeValue.replace(/\s*\n\s*/g, ' ').replace(MD_SPECIAL, '\\$1');
  }
  if (node.nodeType !== 1) return '';

  const tag = node.nodeName.toLowerCase();
  if (tag === 'br') return '\n';
  if (tag === 'script' || tag === 'style') return '';

  /* An image serialises to its PATH, never to its src.
   *
   * The src is a signed link that expires within the hour, so saving it would
   * store something already dying - the notice would show a picture today and
   * a broken one tomorrow. data-path is what the editor wrote when it inserted
   * the picture.
   *
   * An <img> with no data-path is not ours - a paste from elsewhere - and
   * contributes nothing, which keeps the rule that only our own bucket can
   * appear in a message. */
  if (tag === 'img') {
    const path = node.getAttribute('data-path');
    if (!path) return '';
    const alt = (node.getAttribute('alt') || '').replace(MD_SPECIAL, '\\$1');
    return '![' + alt + '](' + path + ')';
  }

  // Code is taken verbatim, so its contents are NOT escaped as Markdown - they
  // are already inside backticks. A backtick in the text would break out of
  // the span, so it is the one thing removed.
  if (tag === 'code' || tag === 'kbd' || tag === 'samp') {
    const text = node.textContent.replace(/`/g, '');
    return text ? '`' + text + '`' : '';
  }

  const kids = [...node.childNodes].map(inlineOf).join('');

  if (tag === 'a') {
    const href = node.getAttribute('href') || '';
    return SAFE_SCHEME.test(href) && kids.trim()
      ? '[' + kids + '](' + href + ')'
      : kids;
  }

  if (!kids.trim()) return kids;

  // Meaning, not tag names. execCommand emits <b> in some browsers and a
  // styled span in others, and a paste from a word processor is nearly always
  // the span.
  const style = node.style || {};
  const weight = String(style.fontWeight || '');
  const bold = tag === 'b' || tag === 'strong' ||
               weight === 'bold' || weight === 'bolder' ||
               (/^\d+$/.test(weight) && Number(weight) >= 600);
  const italic = tag === 'i' || tag === 'em' || style.fontStyle === 'italic';

  let text = kids;
  if (bold) text = '**' + text + '**';
  if (italic) text = '*' + text + '*';
  return text;
}


/* ==========================================================================
 * The editor itself
 * ========================================================================== */

/* Icons rather than characters.
 *
 * The first version used B, I, <> and two emoji. Emoji are the problem: they
 * are drawn by the operating system, so the toolbar was a serif B beside a
 * full-colour Apple link and a typographic quote mark - three different design
 * languages in seven buttons, at three different optical sizes.
 *
 * These are line icons in the same 24-unit box, stroked in currentColor at the
 * same width as the masthead's sun and moon, so the row reads as one set and
 * follows the theme without a second colour being named.
 */
const ICON = (paths) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';

const TOOLS = [
  ['bold', 'Bold', 'Ctrl+B',
   ICON('<path d="M6 4h7a4 4 0 0 1 0 8H6z"/><path d="M6 12h8a4 4 0 0 1 0 8H6z"/>')],
  ['italic', 'Italic', 'Ctrl+I',
   ICON('<line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/>' +
        '<line x1="15" y1="4" x2="9" y2="20"/>')],
  ['code', 'Code', '',
   ICON('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>')],
  ['link', 'Link', 'Ctrl+K',
   ICON('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
        '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>')],
  ['sep'],
  ['insertUnorderedList', 'Bullets', '',
   ICON('<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/>' +
        '<line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none"/>' +
        '<circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/>' +
        '<circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none"/>')],
  ['insertOrderedList', 'Numbers', '',
   ICON('<line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/>' +
        '<line x1="10" y1="18" x2="20" y2="18"/><path d="M4 5.5 5.2 5v3.4"/>' +
        '<path d="M3.6 11.2a1.2 1.2 0 0 1 2 .8c0 .9-2 1.4-2 2.4h2.2"/>' +
        '<path d="M3.7 17h1.9l-1.2 1.3a1.1 1.1 0 1 1-.7 1.9"/>')],
  ['formatBlock', 'Quote', '',
   ICON('<path d="M9 7H5.5A1.5 1.5 0 0 0 4 8.5v3A1.5 1.5 0 0 0 5.5 13H8v1.5A2.5 2.5 0 0 1 5.5 17"/>' +
        '<path d="M20 7h-3.5A1.5 1.5 0 0 0 15 8.5v3a1.5 1.5 0 0 0 1.5 1.5H19v1.5a2.5 2.5 0 0 1-2.5 2.5"/>')]
];

/* The picture button, which is NOT in TOOLS.
 *
 * It appears only when the caller passes an `uploadImage` handler, and only
 * one caller does: the notice editor on the admin page. The reply boxes are never
 * given one, so members and mentors do not get the button - which matters,
 * because a notice is written by an administrator to everybody and a reply is
 * written by anybody to one person. Different trust, different tools.
 */
const IMAGE_TOOL = ['image', 'Picture', '',
  ICON('<rect x="3" y="4" width="18" height="16" rx="2"/>' +
       '<circle cx="8.5" cy="9.5" r="1.4"/>' +
       '<path d="m21 16-4.5-4.5L9 19"/>')];

/* Which buttons can light up.
 *
 * A toolbar that never shows state is a row of guesses - there is no way to
 * tell whether the caret is already inside a bullet without reading the text.
 *
 * The lists are asked of queryCommandState, which is right for them. Bold and
 * italic are NOT, and that is worth saying because the first version used it
 * and was wrong: queryCommandState reads the COMPUTED style, and this site
 * styles every blockquote italic. So putting the caret in a quote lit the
 * italic button, on text the serialiser would never record as italic.
 *
 * The toolbar has one job - to show what will be saved - so bold and italic are
 * decided the same way toMarkdown decides them: by the tags and inline styles
 * actually wrapping the caret. When the two disagree the toolbar is the one
 * that is wrong, because the serialiser is what the database sees. */
const STATE_CMD = new Set(['insertUnorderedList', 'insertOrderedList']);

/** Does an ancestor of `node`, up to `stop`, carry this emphasis? */
function emphasised(node, kind, stop) {
  let el = node && (node.nodeType === 1 ? node : node.parentElement);
  while (el && el !== stop) {
    const tag = el.nodeName.toLowerCase();
    const style = el.style || {};
    if (kind === 'bold') {
      const weight = String(style.fontWeight || '');
      if (tag === 'b' || tag === 'strong' || weight === 'bold' || weight === 'bolder' ||
          (/^\d+$/.test(weight) && Number(weight) >= 600)) return true;
    } else {
      if (tag === 'i' || tag === 'em' || style.fontStyle === 'italic') return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Replace `host` with a toolbar and an editable area.
 *
 * Returns { getMarkdown, setMarkdown, clear, focus, setDisabled, element }.
 * The caller never touches the DOM inside, which is the point - the only way
 * text leaves here is getMarkdown, so the only thing that can be saved is
 * something the serialiser produced.
 */
export function mountEditor(host, opts = {}) {
  const id = opts.id || ('rte-' + Math.random().toString(36).slice(2, 9));
  const label = opts.label || 'Message';

  host.classList.add('rte');
  host.innerHTML =
    '<div class="rte-tools" role="toolbar" aria-label="Formatting">' +
      (opts.uploadImage ? TOOLS.concat([['sep'], IMAGE_TOOL]) : TOOLS)
      .map(([cmd, name, key, icon]) =>
        cmd === 'sep'
          ? '<span class="rte-sep" aria-hidden="true"></span>'
          : '<button type="button" class="rte-tool" data-cmd="' + cmd + '" ' +
            'title="' + escapeHtml(name + (key ? ' (' + key + ')' : '')) + '" ' +
            'aria-label="' + escapeHtml(name) + '" aria-pressed="false">' +
            icon + '</button>').join('') +
    '</div>' +
    '<div class="rte-input" id="' + escapeHtml(id) + '" contenteditable="true" ' +
      'role="textbox" aria-multiline="true" aria-label="' + escapeHtml(label) + '" ' +
      'data-placeholder="' + escapeHtml(opts.placeholder || '') + '"></div>';

  const input = host.querySelector('.rte-input');

  /* One file input, kept in the DOM rather than made per click.
   *
   * The first version built an input on the fly and wrapped it in a promise
   * that had to guess when a cancelled dialog had been cancelled - browsers
   * fire no event for that - and the guess raced the upload and lost. A single
   * long-lived input needs no promise and no guess: a cancel simply fires
   * nothing, which is exactly the right amount of work to do about it.
   */
  const filePicker = document.createElement('input');
  filePicker.type = 'file';
  filePicker.accept = 'image/*';
  filePicker.className = 'sr-only';
  host.appendChild(filePicker);

  filePicker.addEventListener('change', () => {
    const file = filePicker.files && filePicker.files[0];
    filePicker.value = '';
    if (file) placeImage(file);
  });

  /** Upload one file through the page's handler and drop it in at the caret. */
  async function placeImage(file) {
    if (!opts.uploadImage || !file || !file.type.startsWith('image/')) return;

    let img = null;
    try { img = await opts.uploadImage(file); } catch (err) { img = null; }
    if (!img || !img.path || !img.url) return;

    const el = document.createElement('img');
    el.setAttribute('src', img.url);
    // The durable half. src is a signed link that expires; this is what gets
    // saved, and an img without it serialises to nothing.
    el.setAttribute('data-path', img.path);
    el.setAttribute('alt', img.alt || '');
    el.setAttribute('loading', 'lazy');

    input.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount && input.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(el);
      range.setStartAfter(el);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      // The caret was never in the editor - the click came from the toolbar
      // with nothing focused. Appending beats refusing.
      input.appendChild(el);
    }
    syncEmpty();
  }

  /** The first image on a clipboard or a drag, or null. */
  function imageIn(data) {
    if (!data) return null;
    for (const item of data.items || []) {
      if (item.kind === 'file' && String(item.type).startsWith('image/')) {
        const f = item.getAsFile();
        if (f) return f;
      }
    }
    for (const f of data.files || []) {
      if (String(f.type).startsWith('image/')) return f;
    }
    return null;
  }

  // <p> rather than <div> for new paragraphs where the browser allows it. Both
  // serialise identically; this only makes the DOM easier to read while
  // debugging.
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (err) { /* Safari */ }

  const syncEmpty = () => {
    // :empty is no use - a contenteditable that has been typed in and cleared
    // holds a stray <br>, so the placeholder would never come back.
    const bare = input.textContent.replace(/\s+/g, '');
    const hasBlock = input.querySelector('ul, ol, blockquote, img');
    input.classList.toggle('is-empty', !bare && !hasBlock);
  };

  const run = (cmd) => {
    input.focus();

    /* Inserting a picture.
     *
     * The handler does the uploading - this file has no idea what a bucket is,
     * and should not: it is the editor, and where bytes go is the page's
     * business. It returns { path, url } or nothing.
     *
     * data-path is the durable half and src is the throwaway one. The path is
     * what gets saved; the signed URL only has to survive this editing session.
     */
    // The editor owns the picker; the page owns the upload. Opening it is UI,
    // and where bytes go is not this file's business.
    if (cmd === 'image') { filePicker.click(); return; }

    if (cmd === 'link') {
      const url = window.prompt('Link to what? (must start with http:// or https://)');
      if (!url) return;
      if (!SAFE_SCHEME.test(url.trim())) {
        window.alert('Only http:// and https:// links can be added.');
        return;
      }
      document.execCommand('createLink', false, url.trim());
      // execCommand cannot set attributes, and a link opening in this tab
      // would take somebody out of a half-written reply.
      for (const a of input.querySelectorAll('a')) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
      syncEmpty();
      return;
    }

    if (cmd === 'code') {
      // No execCommand for inline code. Wrapping the selection by hand is
      // short enough, and falls back to doing nothing when nothing is picked
      // rather than inserting an empty element the caret then sits outside of.
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const text = range.toString();
      if (!text) return;
      const el = document.createElement('code');
      el.textContent = text;
      range.deleteContents();
      range.insertNode(el);
      sel.removeAllRanges();
      syncEmpty();
      return;
    }

    if (cmd === 'formatBlock') {
      const inQuote = !!(window.getSelection().anchorNode &&
        closestIn(window.getSelection().anchorNode, 'blockquote', input));
      document.execCommand('formatBlock', false, inQuote ? 'p' : 'blockquote');
      syncEmpty();
      return;
    }

    document.execCommand(cmd, false, null);
    syncEmpty();
    syncState();
  };

  host.querySelector('.rte-tools').addEventListener('mousedown', (e) => {
    // mousedown, not click: clicking a button would move focus out of the
    // editable area and collapse the selection before the command ran.
    const btn = e.target.closest('[data-cmd]');
    if (!btn) return;
    e.preventDefault();
    run(btn.getAttribute('data-cmd'));
  });

  input.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'b') { e.preventDefault(); run('bold'); }
    else if (key === 'i') { e.preventDefault(); run('italic'); }
    else if (key === 'k') { e.preventDefault(); run('link'); }
  });

  /* Paste arrives as plain text, always.
   *
   * Pasting rich HTML would put a stranger's markup in the editor, and while
   * the serialiser would strip it on the way out, what somebody sees before
   * saving would not be what gets saved. Plain text is also what people
   * actually want when pasting out of a chat window or a broker export. */
  input.addEventListener('paste', (e) => {
    /* An image on the clipboard, where the page accepts one.
     *
     * Pasting a screenshot is how somebody actually adds a picture to a
     * notice - the button is the fallback, not the other way round.
     *
     * Where the page passes no uploadImage - every reply box - this branch is
     * skipped and the paste falls through to plain text, which for an image
     * means nothing is inserted. That is the same rule as the button, arrived
     * at from the other direction: a reply cannot carry a picture because
     * nothing on that page is willing to store one. */
    const picture = opts.uploadImage ? imageIn(e.clipboardData) : null;
    if (picture) {
      e.preventDefault();
      placeImage(picture);
      return;
    }

    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
    syncEmpty();
  });

  /* Dropping a file is the same act with a different gesture, and a browser's
   * default for a dropped image is to LEAVE THE PAGE and open the file - which
   * from inside a half-written notice is the worst possible response. So the
   * drop is taken over whether or not the picture can be used. */
  input.addEventListener('dragover', (e) => {
    if (opts.uploadImage && imageIn(e.dataTransfer)) e.preventDefault();
  });

  input.addEventListener('drop', (e) => {
    if (!opts.uploadImage) return;
    const picture = imageIn(e.dataTransfer);
    if (!picture) return;
    e.preventDefault();
    placeImage(picture);
  });

  /* Light up whatever the caret is already inside.
   *
   * selectionchange is a document-level event - there is no element-level
   * equivalent - so this fires for every selection anywhere on the page and
   * has to check the caret is ours before doing anything.
   *
   * It also has to remove itself. drawPage replaces the table's innerHTML on
   * every send, share toggle and page change, so a listener that outlived its
   * editor would accumulate one per redraw, each holding a detached element
   * alive. isConnected is the cheapest reliable test for "my editor is no
   * longer on the page".
   */
  const syncState = () => {
    if (!input.isConnected) {
      document.removeEventListener('selectionchange', syncState);
      return;
    }
    const sel = window.getSelection();
    const inside = sel && sel.anchorNode && input.contains(
      sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentNode);

    for (const btn of host.querySelectorAll('.rte-tool')) {
      const cmd = btn.getAttribute('data-cmd');
      let on = false;
      if (inside) {
        if (STATE_CMD.has(cmd)) {
          try { on = document.queryCommandState(cmd); } catch (err) { on = false; }
        } else if (cmd === 'bold' || cmd === 'italic') {
          on = emphasised(sel.anchorNode, cmd, input);
        } else if (cmd === 'formatBlock') {
          on = !!closestIn(sel.anchorNode, 'blockquote', input);
        } else if (cmd === 'code') {
          on = !!closestIn(sel.anchorNode, 'code', input);
        }
      }
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };

  document.addEventListener('selectionchange', syncState);

  input.addEventListener('input', () => { syncEmpty(); syncState(); });
  input.addEventListener('blur', syncEmpty);
  syncEmpty();

  return {
    element: input,
    getMarkdown: () => toMarkdown(input).trim(),
    // `images` is the same path -> signed URL map renderBody takes. Without it
    // a notice being edited shows its pictures as alt text, which looks like
    // they were lost.
    setMarkdown: (md, images) => {
      input.innerHTML = mdToHtml(md || '', images);
      syncEmpty();
    },
    clear: () => { input.innerHTML = ''; syncEmpty(); },
    focus: () => input.focus(),
    setDisabled: (off) => {
      input.setAttribute('contenteditable', off ? 'false' : 'true');
      for (const b of host.querySelectorAll('.rte-tool')) b.disabled = !!off;
    }
  };
}

/** Element.closest, but stopping at a boundary and safe on a text node. */
function closestIn(node, tag, boundary) {
  let el = node.nodeType === 1 ? node : node.parentElement;
  while (el && el !== boundary) {
    if (el.nodeName.toLowerCase() === tag) return el;
    el = el.parentElement;
  }
  return null;
}
