/* Drawing on the session chart: callouts, arrows and boxes.
 *
 * The chart itself is ours - inline SVG from chart.js, no library. This module
 * is only the EDITOR: while it is open, a Konva stage sits exactly over the
 * plot and provides the grab-handles (move, resize, drag an arrow's ends, drag a
 * callout's pointer) that are expensive to write by hand. When it closes, the
 * stage is removed and chart.js draws the same drawings back as plain SVG.
 *
 * DECISIONS 2026-09-21 has the reasoning for taking a dependency here after
 * refusing one for the chart. The short version: the chart is arithmetic we
 * already own; interactive handles are a UI toolkit, and Konva is a good one.
 *
 *
 * NOTHING KONVA DRAWS IS STORED IN PIXELS.
 *
 * Konva works in pixels of the stage. The rows in `chart_marks` hold an instant
 * and a price for every point, because the chart is cropped, zoomed and opened
 * on screens of every size, and a drawing stored as "400 across, 120 down"
 * points at the right candle only until one of those happens. Every point goes
 * through `toStage` on the way in and `fromStage` on the way out, and those two
 * read the scale the chart publishes on its own element - so the editor and the
 * view cannot disagree about where a price is.
 *
 *
 * KONVA IS LOADED ONLY WHEN THE EDITOR OPENS, AND PINNED BY HASH.
 *
 * 187 KB that nobody reading their calendar needs. And it runs on a page that
 * holds the member's signed-in session, so the script tag carries an integrity
 * hash: if the CDN ever serves anything but the exact file checked on
 * 21 September 2026, the browser refuses to run it and the editor says so.
 */

import { BUBBLE, bubbleLines, bubbleSize } from './chart.js';

const KONVA_URL = 'https://cdn.jsdelivr.net/npm/konva@10.6.0/konva.min.js';
const KONVA_SRI = 'sha384-Z9GHC/bKcz6U27A4H+CACye/DCDi4nnbtEgWErd196R7J5YAhI/zBVrH1WqH02RM';

/* The palette of colours a drawing may take. Names of theme tokens, not
 * values: the stored row says "bear", and the colour is whatever the theme
 * says bear is today, in whichever of light and dark the reader is in. */
export const COLOURS = ['accent', 'bull', 'bear', 'fg'];

let konvaLoading = null;

/** Konva, loaded once, from a pinned file. Rejects if the hash does not match. */
export function loadKonva() {
  if (window.Konva) return Promise.resolve(window.Konva);
  if (konvaLoading) return konvaLoading;

  konvaLoading = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = KONVA_URL;
    tag.integrity = KONVA_SRI;
    tag.crossOrigin = 'anonymous';
    tag.onload = () => (window.Konva ? resolve(window.Konva)
                                     : reject(new Error('Konva loaded but did not define itself')));
    // An integrity mismatch lands here too, and is indistinguishable from a
    // network failure to the page - which is fine, because both mean the same
    // thing to the member: the editor is not available right now.
    tag.onerror = () => { konvaLoading = null; reject(new Error('Could not load the drawing tools')); };
    document.head.appendChild(tag);
  });
  return konvaLoading;
}

const token = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim() || '#c4262e';

/* ------------------------------ coordinates -------------------------------

   The chart publishes t0, t1, lo, hi and its plot box on the <svg>. A point in
   time and price becomes a drawing unit by the same arithmetic chart.js uses,
   and a drawing unit becomes a screen pixel by the browser's own transform -
   which already knows about the SVG being scaled to fit its box.
-------------------------------------------------------------------------- */

function scaleOf(svg) {
  const n = (k) => Number(svg.dataset[k]);
  return {
    t0: n('t0'), t1: n('t1'), lo: n('lo'), hi: n('hi'),
    left: n('padLeft'), top: n('padTop'), w: n('plotW'), h: n('plotH')
  };
}

function makeMapper(svg, host) {
  const sc = scaleOf(svg);
  const ctm = svg.getScreenCTM();
  const inv = ctm.inverse();
  const box = host.getBoundingClientRect();
  const pt = svg.createSVGPoint();

  return {
    /** Drawing units per screen pixel, for sizing text and strokes to match. */
    k: ctm.a,

    toStage(atMs, price) {
      pt.x = sc.left + ((atMs - sc.t0) / (sc.t1 - sc.t0)) * sc.w;
      pt.y = sc.top + (1 - (price - sc.lo) / (sc.hi - sc.lo)) * sc.h;
      const p = pt.matrixTransform(ctm);
      return { x: p.x - box.left, y: p.y - box.top };
    },

    fromStage(x, y) {
      pt.x = x + box.left;
      pt.y = y + box.top;
      const p = pt.matrixTransform(inv);
      const fx = (p.x - sc.left) / sc.w;
      const fy = (p.y - sc.top) / sc.h;
      /* Rounded to the whole second. The pixel round trip comes back a
       * millisecond out - 13:44:59.999 for 13:45 - which is harmless once and
       * a slow drift for a drawing re-saved on every drag. Nobody marks a
       * chart to finer than a second. */
      return {
        at: Math.round((sc.t0 + fx * (sc.t1 - sc.t0)) / 1000) * 1000,
        price: sc.lo + (1 - fy) * (sc.hi - sc.lo)
      };
    },

    /** The plot area in stage pixels, for placing a new drawing in view. */
    plot() {
      const a = this.toStage(sc.t0, sc.hi);
      const b = this.toStage(sc.t1, sc.lo);
      return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
    }
  };
}

/* -------------------------------- editor ---------------------------------- */

/**
 * Open the editor over one chart.
 *
 *   figure    the <figure> the chart is in; the stage is positioned inside it
 *   svg       the chart's <svg>, which publishes its scale
 *   symbol    root symbol the drawings belong to
 *   marks     this chart's existing rows
 *   save      async (row) => id           insert or update one drawing
 *   remove    async (id) => void          delete one drawing
 *   snap      (price) => price            round to the instrument's tick
 *   onStatus  (message, kind) => void     tell the member what happened
 *
 * Returns { close }. Saving is continuous - every drag, resize and edit writes
 * straight away - so there is no "unsaved changes" state for the page to track,
 * and closing the editor cannot lose work.
 */
export async function openEditor({ figure, svg, symbol, marks, save, remove, snap, onStatus }) {
  const Konva = await loadKonva();

  figure.classList.add('is-editing');
  const host = document.createElement('div');
  host.className = 'ch-stage';
  figure.insertBefore(host, svg.nextSibling);

  // The stage covers the SVG exactly: same box, same place.
  const r = svg.getBoundingClientRect();
  const fr = figure.getBoundingClientRect();
  host.style.left = (r.left - fr.left) + 'px';
  host.style.top = (r.top - fr.top) + 'px';
  host.style.width = r.width + 'px';
  host.style.height = r.height + 'px';

  const map = makeMapper(svg, host);
  const stage = new Konva.Stage({ container: host, width: r.width, height: r.height });
  const layer = new Konva.Layer();
  stage.add(layer);

  const transformer = new Konva.Transformer({
    rotateEnabled: false,
    keepRatio: false,
    ignoreStroke: true,
    anchorSize: 8,
    borderStroke: token('accent'),
    anchorStroke: token('accent')
  });
  layer.add(transformer);

  const items = new Map();       // node -> { row, kind, write() }
  let selected = null;

  const select = (item) => {
    selected = item;
    for (const it of items.values()) it.showHandles && it.showHandles(it === item);
    transformer.nodes(item && item.kind === 'box' ? [item.node] : []);
    layer.batchDraw();
  };

  stage.on('mousedown touchstart', (e) => {
    if (e.target === stage) select(null);
  });

  /* ONE WRITE PER GESTURE, not per pixel. dragend and transformend fire once
   * when the hand lets go; a debounce covers the text box, which fires on
   * every keystroke. */
  const persist = async (item) => {
    try {
      const id = await save(item.toRow());
      if (id && !item.row.id) item.row.id = id;
      onStatus('Saved.', 'ok');
    } catch (err) {
      onStatus('Could not save that drawing: ' + (err.message || err), 'error');
    }
  };

  const colourOf = (row) => token(COLOURS.includes(row.style?.color) ? row.style.color : 'accent');

  /* ------------------------------ box ------------------------------ */

  function addBox(row) {
    const a = map.toStage(Date.parse(row.at), Number(row.price));
    const b = map.toStage(Date.parse(row.at_end), Number(row.price_end));
    const node = new Konva.Rect({
      x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y),
      stroke: colourOf(row), strokeWidth: 1.6, fill: colourOf(row), opacity: 1,
      draggable: true, cornerRadius: 2
    });
    node.fill(hexA(colourOf(row), 0.12));

    const item = {
      kind: 'box', node, row,
      toRow() {
        // Scale is folded back into size, so the stored shape is the shape
        // seen, not a shape plus a transform nobody else knows to apply.
        const w = node.width() * node.scaleX();
        const h = node.height() * node.scaleY();
        node.setAttrs({ width: w, height: h, scaleX: 1, scaleY: 1 });
        const p = map.fromStage(node.x(), node.y());
        const q = map.fromStage(node.x() + w, node.y() + h);
        return {
          ...base(row, 'box'),
          at: new Date(Math.min(p.at, q.at)).toISOString(),
          at_end: new Date(Math.max(p.at, q.at)).toISOString(),
          price: snap(Math.max(p.price, q.price)),
          price_end: snap(Math.min(p.price, q.price))
        };
      },
      recolour(c) { node.stroke(token(c)); node.fill(hexA(token(c), 0.12)); }
    };
    node.on('mousedown touchstart', () => select(item));
    node.on('dragend transformend', () => persist(item));
    layer.add(node);
    items.set(node, item);
    return item;
  }

  /* ------------------------------ arrow ------------------------------ */

  function addArrow(row) {
    const a = map.toStage(Date.parse(row.at), Number(row.price));
    const b = map.toStage(Date.parse(row.at_end), Number(row.price_end));
    const c = colourOf(row);

    const node = new Konva.Arrow({
      points: [a.x, a.y, b.x, b.y],
      stroke: c, fill: c, strokeWidth: 2.4, pointerLength: 11, pointerWidth: 11,
      lineCap: 'round', draggable: true, hitStrokeWidth: 14
    });

    /* Two handles, one per end. A Transformer resizes a bounding box, which is
     * the wrong question for an arrow: what somebody wants is to move the tip
     * onto a candle and leave the tail where it is. */
    const handle = (x, y) => new Konva.Circle({
      x, y, radius: 6, fill: token('paper') || '#fff', stroke: c, strokeWidth: 2,
      draggable: true, visible: false
    });
    const tail = handle(a.x, a.y);
    const tip = handle(b.x, b.y);

    const sync = () => {
      const pts = node.points();
      const dx = node.x(), dy = node.y();
      tail.position({ x: pts[0] + dx, y: pts[1] + dy });
      tip.position({ x: pts[2] + dx, y: pts[3] + dy });
    };
    tail.on('dragmove', () => {
      node.points([tail.x() - node.x(), tail.y() - node.y(), node.points()[2], node.points()[3]]);
    });
    tip.on('dragmove', () => {
      node.points([node.points()[0], node.points()[1], tip.x() - node.x(), tip.y() - node.y()]);
    });
    node.on('dragmove', sync);

    const item = {
      kind: 'arrow', node, row,
      showHandles(on) { tail.visible(on); tip.visible(on); },
      toRow() {
        const pts = node.points();
        const p = map.fromStage(pts[0] + node.x(), pts[1] + node.y());
        const q = map.fromStage(pts[2] + node.x(), pts[3] + node.y());
        return {
          ...base(row, 'arrow'),
          at: new Date(p.at).toISOString(), price: snap(p.price),
          at_end: new Date(q.at).toISOString(), price_end: snap(q.price)
        };
      },
      recolour(col) { const v = token(col); node.stroke(v); node.fill(v); tail.stroke(v); tip.stroke(v); },
      destroy() { tail.destroy(); tip.destroy(); }
    };
    for (const n of [node, tail, tip]) {
      n.on('mousedown touchstart', () => select(item));
      n.on('dragend', () => persist(item));
    }
    layer.add(node, tail, tip);
    items.set(node, item);
    return item;
  }

  /* ----------------------------- callout ----------------------------- */

  function addCallout(row) {
    const at = map.toStage(Date.parse(row.at), Number(row.price));
    const mid = map.toStage(Date.parse(row.at_end), Number(row.price_end));
    const c = colourOf(row);
    const k = 1 / map.k;             // drawing units -> stage pixels

    const bubble = new Konva.Group({ x: mid.x, y: mid.y, draggable: true });
    const rect = new Konva.Rect({
      fill: token('paper') || '#fff', stroke: c, strokeWidth: 1.6, cornerRadius: 5
    });
    const text = new Konva.Text({
      fontSize: BUBBLE.font / k, lineHeight: BUBBLE.line / BUBBLE.font,
      fill: token('fg') || '#111', fontFamily: getComputedStyle(document.body).fontFamily
    });
    bubble.add(rect, text);

    const leader = new Konva.Line({ stroke: c, strokeWidth: 1.6 });
    const point = new Konva.Circle({
      x: at.x, y: at.y, radius: 5, fill: c, draggable: true
    });

    /* Laid out from the SAME wrap and size chart.js uses, so the bubble on the
     * stage is the bubble the view draws after Done - not a near miss that
     * jumps. The group's origin is the bubble's centre, which is what is
     * stored. */
    const layout = () => {
      const lines = bubbleLines(row.body || 'Double-click to write');
      const size = bubbleSize(lines);
      const w = size.w / k, h = size.h / k;
      rect.setAttrs({ x: -w / 2, y: -h / 2, width: w, height: h });
      text.setAttrs({ x: -w / 2 + BUBBLE.pad / k, y: -h / 2 + (BUBBLE.pad - 2) / k,
                      text: lines.join('\n'),
                      opacity: row.body ? 1 : 0.55 });
      // The leader leaves from the edge nearest the point, so it never
      // crosses the words.
      const bx = bubble.x(), by = bubble.y();
      const ex = Math.min(Math.max(point.x(), bx - w / 2), bx + w / 2);
      const ey = Math.min(Math.max(point.y(), by - h / 2), by + h / 2);
      leader.points([point.x(), point.y(), ex, ey]);
    };
    layout();
    bubble.on('dragmove', layout);
    point.on('dragmove', layout);

    const item = {
      kind: 'callout', node: bubble, row,
      toRow() {
        const p = map.fromStage(point.x(), point.y());
        const q = map.fromStage(bubble.x(), bubble.y());
        return {
          ...base(row, 'callout'),
          at: new Date(p.at).toISOString(), price: snap(p.price),
          at_end: new Date(q.at).toISOString(), price_end: snap(q.price),
          body: row.body || null
        };
      },
      recolour(col) { const v = token(col); rect.stroke(v); leader.stroke(v); point.fill(v); },
      destroy() { leader.destroy(); point.destroy(); },
      relayout: layout
    };

    for (const n of [bubble, point]) {
      n.on('mousedown touchstart', () => select(item));
      n.on('dragend', () => persist(item));
    }
    bubble.on('dblclick dbltap', () => editText(item, rect));

    layer.add(leader, point, bubble);
    items.set(bubble, item);
    return item;
  }

  /* Writing in a callout. A real textarea laid over the bubble, not a
   * prompt(): it is where the words will be, it is styled like the rest of the
   * site, and on a phone it brings up the keyboard rather than a system
   * dialog. Enter saves, Shift+Enter is a new line, Escape abandons. */
  function editText(item, rect) {
    const box = rect.getClientRect();
    const area = document.createElement('textarea');
    area.className = 'ch-draw-text';
    area.value = item.row.body || '';
    area.maxLength = 200;
    area.style.left = (box.x + host.offsetLeft) + 'px';
    area.style.top = (box.y + host.offsetTop) + 'px';
    area.style.width = Math.max(box.width, 180) + 'px';
    area.style.height = Math.max(box.height, 48) + 'px';
    figure.appendChild(area);
    area.focus();
    area.select();

    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true;
      if (keep) {
        item.row.body = area.value.trim();
        item.relayout();
        layer.batchDraw();
        persist(item);
      }
      area.remove();
    };
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    area.addEventListener('blur', () => finish(true));
  }

  /* --------------------------- building -------------------------------- */

  const build = (row) =>
    row.kind === 'box' ? addBox(row)
    : row.kind === 'arrow' ? addArrow(row)
    : row.kind === 'callout' ? addCallout(row)
    : null;

  for (const row of marks) {
    if (!row.at_end || row.price_end === null || row.price_end === undefined) continue;
    build({ ...row });
  }
  layer.batchDraw();

  /** A new drawing, placed in the middle of what is on screen. */
  async function add(kind, colour) {
    const p = map.plot();
    const cx = p.x + p.w * 0.5, cy = p.y + p.h * 0.45;
    const span = Math.min(p.w, p.h);
    const pos = (x, y) => map.fromStage(x, y);

    const at1 = pos(cx - span * 0.18, cy - span * 0.12);
    const at2 = pos(cx + span * 0.18, cy + span * 0.12);
    const row = {
      id: null, symbol, kind, body: null,
      style: { color: colour || 'accent' },
      at: new Date(at1.at).toISOString(), price: snap(at1.price),
      at_end: new Date(at2.at).toISOString(), price_end: snap(at2.price)
    };

    if (kind === 'callout') {
      // The point low and left, the bubble up and to the right of it.
      const tipAt = pos(cx - span * 0.15, cy + span * 0.15);
      const bubAt = pos(cx + span * 0.1, cy - span * 0.12);
      Object.assign(row, {
        at: new Date(tipAt.at).toISOString(), price: snap(tipAt.price),
        at_end: new Date(bubAt.at).toISOString(), price_end: snap(bubAt.price)
      });
    }

    const item = build(row);
    select(item);
    layer.batchDraw();
    await persist(item);
    if (kind === 'callout') editText(item, item.node.findOne('Rect'));
  }

  async function deleteSelected() {
    if (!selected) return;
    const item = selected;
    select(null);
    if (item.destroy) item.destroy();
    item.node.destroy();
    items.delete(item.node);
    layer.batchDraw();
    if (item.row.id) {
      try { await remove(item.row.id); onStatus('Deleted.', 'ok'); }
      catch (err) { onStatus('Could not delete that: ' + (err.message || err), 'error'); }
    }
  }

  function recolourSelected(colour) {
    if (!selected) return false;
    selected.row.style = { ...(selected.row.style || {}), color: colour };
    selected.recolour(colour);
    layer.batchDraw();
    persist(selected);
    return true;
  }

  const onKey = (e) => {
    if (e.target.closest && e.target.closest('textarea, input')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    if (e.key === 'Escape') select(null);
  };
  document.addEventListener('keydown', onKey);

  return {
    add,
    deleteSelected,
    recolourSelected,
    hasSelection: () => !!selected,
    close() {
      document.removeEventListener('keydown', onKey);
      stage.destroy();
      host.remove();
      figure.querySelectorAll('.ch-draw-text').forEach((t) => t.remove());
      figure.classList.remove('is-editing');
    }
  };
}

/* The part of a row every drawing shares. */
function base(row, kind) {
  return { id: row.id || null, symbol: row.symbol, kind, body: row.body ?? null,
           style: row.style || null };
}

/* A colour with alpha, from whatever form the theme gave it.
 *
 * The tokens are hex today, but a token is allowed to become rgb() or a named
 * colour, and the first version of this handed anything that was not hex back
 * UNCHANGED - which, for a fill, meant a solid box laid over the very candles
 * it was drawn round. So the browser parses it: a canvas context normalises
 * any CSS colour it accepts into #rrggbb, and that is read back. */
let parser = null;
function hexA(colour, alpha) {
  parser = parser || document.createElement('canvas').getContext('2d');
  parser.fillStyle = '#000000';
  parser.fillStyle = colour;
  const m = /^#([0-9a-f]{6})$/i.exec(parser.fillStyle);
  if (!m) return 'rgba(0,0,0,' + alpha + ')';
  const n = parseInt(m[1], 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}
