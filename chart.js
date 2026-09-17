/* Candles, and a member's own fills drawn on them.
 *
 * Inline SVG, no library. The rule against a build step means any dependency
 * arrives over a CDN, and a candlestick chart is a few hundred lines of
 * arithmetic - cheaper to own than to pin a version of.
 *
 *
 * THE SESSION WINDOW IS NOT COMPUTED HERE, ON PURPOSE.
 *
 * A CME session runs 18:00 New York the evening before to 17:00 on its own day,
 * which is DST-sensitive and exactly the sort of thing that is wrong an hour at
 * a time twice a year. That maths lives in ONE place - the fetch job, where it
 * decides what to ask the source for - and is tested in
 * tools/probe-session-window.mjs.
 *
 * The page instead asks for bars loosely AROUND the trades it is drawing and
 * takes the contiguous run that comes back. Bars only exist for sessions, so
 * the run IS the session, and the browser needs to know nothing about when
 * Chicago thinks a day starts. The cost is one wider query; the saving is not
 * having a second copy of a timezone rule to keep in step.
 *
 *
 * WHAT IS DRAWN, AND WHAT IS DELIBERATELY NOT
 *
 * The candles are context. The MARKERS ARE THE POINT, and they are drawn at the
 * member's own fill price - never snapped to the bar's high, low or close. A
 * fill outside the candle is a real thing that happens, and moving the marker
 * to make the picture tidy would be the chart lying about the one number on it
 * that belongs to the member.
 *
 * One marker per DECISION, not per row. Eighteen copied prop accounts turn one
 * entry into eighteen identical trades; callers pass the output of
 * distinctDecisions().
 */

import { escapeHtml, money } from './app.js';

/* A gap longer than this between consecutive bars means a different session.
 * Five-minute bars sit five minutes apart all through a Globex day - the only
 * break is the daily maintenance hour - so anything above half an hour is a
 * boundary rather than a quiet patch. */
const SESSION_GAP_MS = 30 * 60 * 1000;

const PAD = { top: 14, right: 58, bottom: 26, left: 8 };

/** Bars arrive as one long list; return the contiguous run containing `at`. */
export function sessionRun(bars, at) {
  if (!bars.length) return [];
  const runs = [[bars[0]]];
  for (let i = 1; i < bars.length; i++) {
    const gap = new Date(bars[i].ts) - new Date(bars[i - 1].ts);
    if (gap > SESSION_GAP_MS) runs.push([]);
    runs[runs.length - 1].push(bars[i]);
  }

  // The run holding the moment asked about; failing that, the longest, which is
  // the whole session rather than the tail of the one before it.
  const target = new Date(at).getTime();
  const holding = runs.find((run) =>
    new Date(run[0].ts).getTime() <= target &&
    target <= new Date(run[run.length - 1].ts).getTime() + SESSION_GAP_MS);

  return holding || runs.sort((a, b) => b.length - a.length)[0];
}

/** Root symbol for a traded one: micros print the same prices as the full size. */
export function barSymbol(symbol) {
  const s = String(symbol || '').toUpperCase();
  if (s === 'MNQ' || s === 'NQ') return 'NQ';
  if (s === 'MES' || s === 'ES') return 'ES';
  return s;
}

const hhmm = (value) => new Date(value)
  .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/* --------------------------------- scales -------------------------------- */

function scales(bars, decisions, width, height) {
  const t0 = new Date(bars[0].ts).getTime();
  const step = bars.length > 1
    ? new Date(bars[1].ts).getTime() - t0
    : 5 * 60 * 1000;
  const t1 = new Date(bars[bars.length - 1].ts).getTime() + step;

  let lo = Infinity;
  let hi = -Infinity;
  for (const b of bars) {
    lo = Math.min(lo, Number(b.low));
    hi = Math.max(hi, Number(b.high));
  }

  /* The fills stretch the price axis if they sit outside the candles.
   *
   * They should not, and occasionally do - a bad print, a fill recorded against
   * the wrong contract, a typo in a hand-entered trade. Growing the axis keeps
   * such a marker ON the chart where it can be seen and questioned, rather than
   * clipped off an edge where the chart silently disagrees with the journal. */
  for (const d of decisions) {
    for (const p of [d.entry, d.exit_price]) {
      const v = Number(p);
      if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
  }

  const span = (hi - lo) || 1;
  lo -= span * 0.04;
  hi += span * 0.04;

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  return {
    t0, t1, lo, hi, step, plotW, plotH,
    x: (ts) => PAD.left + ((new Date(ts).getTime() - t0) / (t1 - t0)) * plotW,
    y: (price) => PAD.top + (1 - (Number(price) - lo) / (hi - lo)) * plotH,
    barW: Math.max(1.4, (plotW / bars.length) * 0.62)
  };
}

/* --------------------------------- pieces -------------------------------- */

function priceAxis(s, width) {
  const ticks = 5;
  let out = '';
  for (let i = 0; i <= ticks; i++) {
    const price = s.lo + ((s.hi - s.lo) * i) / ticks;
    const y = s.y(price);
    out +=
      '<line class="ch-grid" x1="' + PAD.left + '" y1="' + y.toFixed(1) +
        '" x2="' + (width - PAD.right) + '" y2="' + y.toFixed(1) +
        '" stroke="currentColor" stroke-width="0.5" opacity="0.18"/>' +
      '<text class="ch-axis" x="' + (width - PAD.right + 6) + '" y="' + (y + 3.5).toFixed(1) +
        '" fill="currentColor" font-size="9" opacity="0.65">' +
        escapeHtml(price.toFixed(price >= 1000 ? 0 : 2)) + '</text>';
  }
  return out;
}

function timeAxis(s, bars, height) {
  // Roughly one label an hour, whatever the session length, and always on a
  // real bar so a label never points at a gap.
  const perHour = Math.max(1, Math.round(3600000 / s.step));
  let out = '';
  for (let i = 0; i < bars.length; i += perHour) {
    const x = s.x(bars[i].ts);
    out += '<text class="ch-axis" x="' + x.toFixed(1) + '" y="' + (height - 8) +
      '" fill="currentColor" font-size="9" opacity="0.65" text-anchor="middle">' +
      escapeHtml(hhmm(bars[i].ts)) + '</text>';
  }
  return out;
}

function candles(bars, s) {
  let out = '';
  for (const b of bars) {
    const o = Number(b.open), c = Number(b.close);
    const up = c >= o;
    const cls = up ? 'ch-up' : 'ch-down';
    const x = s.x(b.ts);
    const yHigh = s.y(b.high), yLow = s.y(b.low);
    const yO = s.y(o), yC = s.y(c);
    const top = Math.min(yO, yC);
    // A doji has no body at all; without a floor it renders as nothing.
    const bodyH = Math.max(0.8, Math.abs(yC - yO));

    out +=
      '<line class="' + cls + '" x1="' + x.toFixed(1) + '" y1="' + yHigh.toFixed(1) +
        '" x2="' + x.toFixed(1) + '" y2="' + yLow.toFixed(1) +
        '" stroke="currentColor" stroke-width="0.7"/>' +
      '<rect class="' + cls + '" x="' + (x - s.barW / 2).toFixed(1) + '" y="' + top.toFixed(1) +
        '" width="' + s.barW.toFixed(1) + '" height="' + bodyH.toFixed(1) +
        '" fill="currentColor" stroke="currentColor" stroke-width="0.4"/>';
  }
  return out;
}

/* The fills. Everything above this is scenery. */
function markers(decisions, s, value) {
  let out = '';

  for (const d of decisions) {
    const entry = Number(d.entry);
    const exit = Number(d.exit_price);
    const won = value(d) > 0;
    const cls = won ? 'ch-win' : 'ch-loss';
    const long = d.direction === 'long';

    const hasEntry = Number.isFinite(entry);
    const hasExit = Number.isFinite(exit);
    if (!hasEntry && !hasExit) continue;      // nothing to place it at

    const xIn = s.x(d.opened_at);
    const xOut = s.x(d.closed_at || d.opened_at);
    const yIn = hasEntry ? s.y(entry) : null;
    const yOut = hasExit ? s.y(exit) : null;

    /* The stop and target band, only where they exist.
     *
     * Most imported trades have neither - no broker export carries them - and
     * their absence is ordinary rather than an error. Drawn first so the
     * markers sit on top of it. */
    const stop = Number(d.stop), target = Number(d.target);
    if (hasEntry && (Number.isFinite(stop) || Number.isFinite(target))) {
      const yStop = Number.isFinite(stop) ? s.y(stop) : yIn;
      const yTarget = Number.isFinite(target) ? s.y(target) : yIn;
      const top = Math.min(yStop, yTarget);
      const h = Math.abs(yStop - yTarget);
      const w = Math.max(6, Math.abs(xOut - xIn));
      out += '<rect class="ch-band" x="' + xIn.toFixed(1) + '" y="' + top.toFixed(1) +
        '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) +
        '" fill="currentColor" opacity="0.10"/>';
    }

    if (hasEntry && hasExit) {
      out += '<line class="' + cls + '" x1="' + xIn.toFixed(1) + '" y1="' + yIn.toFixed(1) +
        '" x2="' + xOut.toFixed(1) + '" y2="' + yOut.toFixed(1) +
        '" stroke="currentColor" stroke-width="1.4" opacity="0.85"/>';
    }

    const label = escapeHtml(
      (long ? 'Long' : 'Short') + ' ' + (d.contracts || '') + ' ' + (d.symbol || '') +
      ' at ' + hhmm(d.opened_at) +
      (hasEntry ? ', in ' + entry : '') + (hasExit ? ', out ' + exit : '') +
      ' — ' + money(value(d)));

    if (hasEntry) {
      // Point the way the trade was taken: up for a long, down for a short.
      const r = 4.2;
      const tri = long
        ? [[xIn, yIn - r], [xIn - r, yIn + r], [xIn + r, yIn + r]]
        : [[xIn, yIn + r], [xIn - r, yIn - r], [xIn + r, yIn - r]];
      out += '<polygon class="' + cls + '" points="' +
        tri.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' ') +
        '" fill="currentColor" stroke="var(--page, #fff)" stroke-width="0.8">' +
        '<title>' + label + '</title></polygon>';
    }

    if (hasExit) {
      out += '<rect class="' + cls + '" x="' + (xOut - 3).toFixed(1) + '" y="' + (yOut - 3).toFixed(1) +
        '" width="6" height="6" fill="currentColor" stroke="var(--page, #fff)" stroke-width="0.8">' +
        '<title>' + label + '</title></rect>';
    }
  }

  return out;
}

/* --------------------------------- charts -------------------------------- */

/**
 * Candles with the day's decisions on them.
 *
 * `bars`      rows from market_bars, ascending, already trimmed to one session
 * `decisions` de-duplicated trades - distinctDecisions(), never raw rows
 * `value`     what a trade was worth, so dollars and R can both be drawn
 */
export function barChart(bars, decisions, { symbol, value, width = 880, height = 300 } = {}) {
  if (!bars || !bars.length) return '';

  const s = scales(bars, decisions, width, height);
  const from = hhmm(bars[0].ts);
  const to = hhmm(bars[bars.length - 1].ts);

  return '<figure class="ch-figure">' +
    '<svg class="ch-svg" viewBox="0 0 ' + width + ' ' + height + '" ' +
      'preserveAspectRatio="none" role="img" ' +
      'aria-label="' + escapeHtml(symbol + ' five-minute candles from ' + from + ' to ' + to +
        ', with ' + decisions.length + ' of your ' +
        (decisions.length === 1 ? 'decision' : 'decisions') + ' marked') + '">' +
      priceAxis(s, width) +
      candles(bars, s) +
      markers(decisions, s, value) +
      timeAxis(s, bars, height) +
    '</svg>' +
    '<figcaption class="stat-note">' + escapeHtml(symbol) + ' 5-minute candles, ' +
      escapeHtml(from) + ' to ' + escapeHtml(to) + '. Markers sit at your own fill prices, ' +
      'not at the candle.</figcaption>' +
  '</figure>';
}

/**
 * The same day with no candles behind it.
 *
 * Not an error state and not a placeholder: for an untracked symbol this is the
 * only chart there will ever be, and it still answers where the entries sat
 * against each other and how the day ran.
 */
export function tradeMap(decisions, { value, width = 880, height = 220 } = {}) {
  const usable = decisions.filter((d) => Number.isFinite(Number(d.entry)));
  if (!usable.length) return '';

  const times = usable.flatMap((d) => [new Date(d.opened_at).getTime(),
                                       new Date(d.closed_at || d.opened_at).getTime()]);
  const prices = usable.flatMap((d) => [Number(d.entry), Number(d.exit_price)])
    .filter((v) => Number.isFinite(v));

  const pad = (Math.max(...prices) - Math.min(...prices)) * 0.12 || 1;
  const fake = [{ ts: new Date(Math.min(...times) - 60000).toISOString(),
                  low: Math.min(...prices) - pad, high: Math.max(...prices) + pad },
                { ts: new Date(Math.max(...times) + 60000).toISOString(),
                  low: Math.min(...prices) - pad, high: Math.max(...prices) + pad }];

  const s = scales(fake, usable, width, height);

  const first = Math.min(...times);
  const last = Math.max(...times);

  return '<figure class="ch-figure">' +
    '<svg class="ch-svg" viewBox="0 0 ' + width + ' ' + height + '" ' +
      'preserveAspectRatio="none" role="img" ' +
      'aria-label="' + escapeHtml(usable.length + ' ' +
        (usable.length === 1 ? 'decision' : 'decisions') +
        ' by time and price, ' + hhmm(first) + ' to ' + hhmm(last)) + '">' +
      priceAxis(s, width) +
      markers(usable, s, value) +
      // Two labels rather than an hourly axis: with no bars behind them there
      // is nothing for hourly ticks to line up with, and a grid of times over
      // empty space suggests a precision this view does not have.
      '<text class="ch-axis" x="' + PAD.left + '" y="' + (height - 8) +
        '" fill="currentColor" font-size="9" opacity="0.65">' + escapeHtml(hhmm(first)) + '</text>' +
      '<text class="ch-axis" x="' + (width - PAD.right) + '" y="' + (height - 8) +
        '" fill="currentColor" font-size="9" opacity="0.65" text-anchor="end">' +
        escapeHtml(hhmm(last)) + '</text>' +
    '</svg>' +
    '<figcaption class="stat-note">Your fills by time and price. No candles &mdash; see the note ' +
      'under the chart for why.</figcaption>' +
  '</figure>';
}
