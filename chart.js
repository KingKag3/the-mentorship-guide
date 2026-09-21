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

/* `Number(null)` IS ZERO, AND THAT IS NOT A PRICE.
 *
 * Every price here arrives from Postgres, where an unrecorded one is null - and
 * `Number(null)` is 0, which passes `Number.isFinite` cheerfully. A trade with
 * no entry was therefore drawn at price zero: a marker at the bottom of the
 * chart that looks like a fill, and, because the axis grows to include the
 * fills, an axis stretched from 0 to 29,800 with every candle in the session
 * squashed into a band a few pixels tall.
 *
 * `Number('')` is 0 too, for the same reason and with the same consequence. */
const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

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

/* ------------------------------ cropping ---------------------------------

   A Globex session is 23 hours and a member trades in bursts. On a real day -
   16 September, 39 decisions - the fills spanned two windows adding up to about
   two hours, and got 12% of the chart's width between them while twenty-one
   empty hours took the rest. Every marker was stacked into two smears.

   So the view fits itself to the trades, with an hour of room either side.

   THE HOUR IS NOT PADDING. On that same day the 14:00 drop is the reason the
   afternoon burst happened, and a crop tight to the fills would have hidden the
   thing that explains them. An hour is enough context to see what the price was
   doing before the member acted, without paying for the night.

   The whole session stays one click away, and the caption says what is being
   shown rather than letting a cropped axis pass as the day.
-------------------------------------------------------------------------- */

const CROP_PAD_MS = 60 * 60 * 1000;

/* Zooming in on one trade, or one tally of them.
 *
 * Fifteen minutes either side, and a floor of twenty bars. A single trade
 * lasting four minutes zoomed to exactly itself is three candles on a chart
 * built for two hundred: technically closer and useless. The room around it is
 * what makes the entry mean anything. */
const ZOOM_PAD_MS = 15 * 60 * 1000;
const ZOOM_MIN_BARS = 20;

export function zoomToWindow(bars, from, to) {
  let pad = ZOOM_PAD_MS;
  for (let attempt = 0; attempt < 6; attempt++) {
    const kept = bars.filter((b) => {
      const t = new Date(b.ts).getTime();
      return t >= from - pad && t <= to + pad;
    });
    if (kept.length >= ZOOM_MIN_BARS || kept.length === bars.length) return kept;
    pad *= 2;
  }
  return bars;
}

/** The bars worth drawing for these decisions and marks, and whether anything was cut.
 *
 * MARKS COUNT TOWARDS THE FIT, not only trades. A member who writes "the whole
 * afternoon was tilt" at 16:30 over a morning's trading would otherwise watch
 * the note vanish as it saved: the crop is fitted to the fills, 16:30 falls
 * outside it, and nothing on the page says where it went. A note you cannot
 * find is worse than a wider chart. */
export function cropToTrades(bars, decisions, marks) {
  const stamps = [];
  for (const d of decisions) {
    const open = Date.parse(d.opened_at);
    const close = Date.parse(d.closed_at || d.opened_at);
    if (Number.isFinite(open)) stamps.push(open);
    if (Number.isFinite(close)) stamps.push(close);
  }
  for (const m of marks || []) {
    // Both points of a drawing, or an arrow whose head reaches into the
    // afternoon is cut off by a fit made from its tail.
    for (const t of [Date.parse(m.at), Date.parse(m.at_end)]) {
      if (Number.isFinite(t)) stamps.push(t);
    }
  }
  if (!stamps.length) return { bars, cropped: false };

  const from = Math.min(...stamps) - CROP_PAD_MS;
  const to = Math.max(...stamps) + CROP_PAD_MS;
  const kept = bars.filter((b) => {
    const t = new Date(b.ts).getTime();
    return t >= from && t <= to;
  });

  /* Not worth doing below a point, in both directions. Fewer than thirty bars
   * is a chart of almost nothing, and keeping three quarters of the session
   * means the crop buys no room while costing the context. */
  if (kept.length < 30 || kept.length > bars.length * 0.75) {
    return { bars, cropped: false };
  }
  return { bars: kept, cropped: true };
}

/** Root symbol for a traded one: micros print the same prices as the full size. */
export function barSymbol(symbol) {
  const s = String(symbol || '').toUpperCase();
  if (s === 'MNQ' || s === 'NQ') return 'NQ';
  if (s === 'MES' || s === 'ES') return 'ES';
  return s;
}

/* 24-HOUR, AND NOT THE LOCALE'S CHOICE.
 *
 * `toLocaleTimeString` with no options gives "07:00 PM" here - eight characters
 * for a label that has about forty pixels, so an axis of them ran into each
 * other and read as one long string. A trading session is also the one context
 * where 18:00 is clearer than 6 PM: it says which side of the open it is on
 * without the reader doing arithmetic. */
const hhmm = (value) => new Date(value)
  .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

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
      const v = num(p);
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

/* AS MANY LABELS AS FIT, NOT ONE AN HOUR.
 *
 * A Globex session is 23 hours. One label an hour is 23 of them across 814
 * drawing units - 35 units each, for text that needs about 34 - so they touched,
 * and at the left edge the first ran off the plot and rendered as ":00" with no
 * hour in front of it.
 *
 * The spacing is derived from the space available instead: how many labels fit
 * at a readable width, rounded UP to a whole number of hours so the axis still
 * reads 18:00, 21:00, 00:00 rather than 18:00, 20:37, 23:14. */
function timeAxis(s, bars, height) {
  const LABEL_UNITS = 46;                 // room for "18:00" plus air
  const fits = Math.max(2, Math.floor(s.plotW / LABEL_UNITS));
  const perHour = Math.max(1, Math.round(3600000 / s.step));
  const hoursApart = Math.max(1, Math.ceil(bars.length / perHour / fits));

  /* LABELLED BY THE CLOCK, NOT BY COUNTING BARS.
   *
   * Stepping twelve bars at a time assumes twelve bars an hour, and a session
   * with a candle missing - a minute that did not trade, which the source
   * returns as a null and this drops - puts every later label five minutes out.
   * The axis read 18:00, 19:00 ... 23:00, 00:05, 01:05, which is worse than an
   * unlabelled axis: it looks precise and is wrong.
   *
   * So a bar is labelled when its own clock says it should be. Gaps cost a
   * label rather than shifting every one after them. */
  const chosen = [];
  let lastHour = null;
  for (const b of bars) {
    const at = new Date(b.ts);
    if (at.getMinutes() !== 0) continue;
    const hour = at.getHours();
    if (lastHour !== null && ((hour - lastHour + 24) % 24) < hoursApart) continue;
    lastHour = hour;
    chosen.push(b);
  }

  // The open is the one time a reader looks for first, and it is rarely on the
  // hour after a holiday shortens a session.
  if (!chosen.length || chosen[0].ts !== bars[0].ts) chosen.unshift(bars[0]);

  let out = '';
  for (const bar of chosen) {
    const x = s.x(bar.ts);
    // Never let the first or last label hang off its own plot.
    const anchor = x < PAD.left + LABEL_UNITS / 2 ? 'start'
                 : x > PAD.left + s.plotW - LABEL_UNITS / 2 ? 'end' : 'middle';
    out += '<text class="ch-axis" x="' + x.toFixed(1) + '" y="' + (height - 8) +
      '" fill="currentColor" font-size="10" opacity="0.7" text-anchor="' + anchor + '">' +
      escapeHtml(hhmm(bar.ts)) + '</text>';
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

/* The fills. Everything above this is scenery.
 *
 * Returns the markup AND a count, because a decision with no entry and no exit
 * price cannot be placed and silently vanishes otherwise. An empty-looking
 * chart over a day with trades on it is the page disagreeing with the journal
 * and not saying so - the caption reports the difference. */
/* NUMBERED, BECAUSE A TRIANGLE IS NOT A SENTENCE.
 *
 * A marker can say where and roughly which way. It cannot say "short two,
 * out at 29,672, minus a hundred and twenty" at five pixels across a
 * twenty-three hour session, and a tooltip only says it to somebody who already
 * knows to hover.
 *
 * So each decision gets a numeral on the chart and a line under it. The picture
 * answers "when, and where in the range"; the list answers "what was it and
 * what did it cost". Neither has to do both. */
function markers(decisions, s, value, { number = true, flag = false, fmtValue = money,
                                        picked = null, numbers = null, height = 0 } = {}) {
  const isPicked = (n) => !!picked && picked.includes(n);
  let out = '';
  let drawn = 0;
  const flags = [];
  const key = [];

  /* undefined AND null ARE DIFFERENT FACTS, and reading them as one cost an
   * evening. `null` is a price nobody recorded - ordinary, and the caption says
   * so. `undefined` is the column never having been SELECTED, which is a bug in
   * the page doing the asking: the data is there and was not requested.
   *
   * The calendar shipped exactly that, listing its columns explicitly and
   * omitting entry and exit_price, so the chart announced "no entry or exit
   * price recorded" over a journal where every row had both. Specific,
   * confident, wrong. */
  let unasked = 0;

  // Chronological, so the numbers read left to right along the session.
  const ordered = decisions.slice()
    .sort((a, b) => new Date(a.opened_at) - new Date(b.opened_at));

  /* WHERE MARKERS WOULD SIT ON TOP OF EACH OTHER, COUNT THEM INSTEAD.
   *
   * Six triangles drawn at the same six pixels are one triangle with a worse
   * edge, and the chart ends up claiming a density it cannot show: a reader
   * sees three marks and there were eleven trades. A single mark with "6" beside
   * it is both smaller and more honest.
   *
   * Cells are a grid in BOTH axes. Two entries a minute apart at prices forty
   * points apart do not overlap and must not be merged - the vertical distance
   * is the thing worth seeing. */
  /* BY DISTANCE, NOT BY GRID CELL. The first version rounded each marker into a
   * cell and merged matches, which looks equivalent and is not: two markers
   * nine units apart - overlapping, at a marker radius of five - land either
   * side of a cell edge and stay separate, while two on opposite corners of one
   * cell get merged. On a 39-decision fixture it found nothing to tally.
   *
   * So each marker looks for an existing tally within a radius and joins it.
   * Order-dependent, and that is fine here: the decisions arrive in time order,
   * so a run of fills chains onto the first of the run, which is the one a
   * reader would call the group. */
  const OVERLAP = 11;
  const cells = [];

  for (const d of ordered) {
    const entry = num(d.entry);
    const exit = num(d.exit_price);
    const won = value(d) > 0;
    const cls = won ? 'ch-win' : 'ch-loss';
    const long = d.direction === 'long';

    if (d.entry === undefined && d.exit_price === undefined) unasked++;

    const hasEntry = Number.isFinite(entry);
    const hasExit = Number.isFinite(exit);
    if (!hasEntry && !hasExit) continue;      // nothing to place it at
    drawn++;

    /* THE NUMBER IS THE DAY'S, NOT THIS VIEW'S.
     *
     * Zooming draws a subset, and numbering the subset would make trade 21
     * become trade 2 on the way in and 21 again on the way out. The caller
     * decides the numbers once for the whole day and hands them down. */
    const n = numbers ? numbers.get(d) : drawn;
    key.push({
      n, long, won, at: hhmm(d.opened_at),
      contracts: d.contracts, symbol: d.symbol,
      entry: hasEntry ? entry : null,
      exit: hasExit ? exit : null,
      value: value(d),
      from: Date.parse(d.opened_at),
      to: Date.parse(d.closed_at || d.opened_at)
    });

    const xIn = s.x(d.opened_at);
    const xOut = s.x(d.closed_at || d.opened_at);
    const yIn = hasEntry ? s.y(entry) : null;
    const yOut = hasExit ? s.y(exit) : null;

    /* The stop and target band, only where they exist.
     *
     * Most imported trades have neither - no broker export carries them - and
     * their absence is ordinary rather than an error. Drawn first so the
     * markers sit on top of it. */
    const stop = num(d.stop), target = num(d.target);
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

    /* A marker close enough to be drawn on top of another takes a tally rather
     * than being drawn at all. Longs and shorts never merge: the two triangles
     * point different ways and the difference is the point. */
    let twin = null;
    if (hasEntry) {
      for (const c of cells) {
        if (c.long !== long) continue;
        if (Math.hypot(c.x - xIn, c.y - yIn) <= OVERLAP) { twin = c; break; }
      }
    }
    const opened = Date.parse(d.opened_at);
    const closed = Date.parse(d.closed_at || d.opened_at);

    if (twin) {
      twin.count++;
      twin.numbers.push(n);
      twin.wins += won ? 1 : 0;
      twin.total += value(d);
      twin.from = Math.min(twin.from, opened);
      twin.to = Math.max(twin.to, closed);
      continue;
    }
    if (hasEntry) {
      cells.push({ count: 1, numbers: [n], wins: won ? 1 : 0,
                   total: value(d), x: xIn, y: yIn, long,
                   from: opened, to: closed });
    }

    if (hasEntry) {
      // Point the way the trade was taken: up for a long, down for a short.
      const r = 5.4;
      const tri = long
        ? [[xIn, yIn - r], [xIn - r, yIn + r], [xIn + r, yIn + r]]
        : [[xIn, yIn + r], [xIn - r, yIn - r], [xIn + r, yIn - r]];
      out += '<polygon class="' + cls + ' ch-pick' + (isPicked(n) ? ' is-picked' : '') + '" points="' +
        tri.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' ') +
        '" fill="currentColor" stroke="var(--page, #fff)" stroke-width="1" ' +
        'tabindex="0" role="button" data-picks="' + n + '" ' +
        'data-from="' + Date.parse(d.opened_at) + '" ' +
        'data-to="' + Date.parse(d.closed_at || d.opened_at) + '">' +
        '<title>' + label + ' \u2014 click to zoom in</title></polygon>';
    }

    if (hasExit) {
      out += '<rect class="' + cls + (isPicked(n) ? ' is-picked' : '') +
        '" x="' + (xOut - 3.4).toFixed(1) + '" y="' + (yOut - 3.4).toFixed(1) +
        '" width="6.8" height="6.8" fill="currentColor" stroke="var(--page, #fff)" stroke-width="1">' +
        '<title>' + label + '</title></rect>';
    }

    /* The numeral sits ABOVE a long and BELOW a short, which is the same
     * direction the triangle points. On a chart it means the label is on the
     * side the trade was looking, and practically it keeps the numeral off the
     * line running to the exit. */
    if (number && hasEntry) {
      const ny = long ? yIn - 11 : yIn + 17;
      out += '<text class="ch-num ' + cls + '" x="' + xIn.toFixed(1) + '" y="' + ny.toFixed(1) +
        '" fill="currentColor" font-size="12" font-weight="700" text-anchor="middle" ' +
        'stroke="var(--page, #fff)" stroke-width="2.6" paint-order="stroke">' + n + '</text>';
    }

    if (flag && hasEntry) {
      flags.push({ n, x: xIn, y: yIn, long, won, cls,
                   text: n + '  ' + (long ? 'LONG' : 'SHORT') +
                         (d.contracts ? ' ' + d.contracts : '') + '  ' + fmtValue(value(d)) });
    }
  }

  /* The tallies, drawn over the markers they stand for. A cell holding one
   * decision gets nothing: a "1" beside every marker on a quiet day is noise
   * saying what the marker already said. */
  for (const c of cells) {
    if (c.count < 2) continue;
    const cls = c.wins === c.count ? 'ch-win' : c.wins === 0 ? 'ch-loss' : 'ch-mixed';
    out +=
      '<g class="ch-tally ch-pick ' + cls +
        (c.numbers.some(isPicked) ? ' is-picked' : '') + '" tabindex="0" role="button" ' +
        'data-picks="' + c.numbers.join(',') + '" ' +
        'data-from="' + c.from + '" data-to="' + c.to + '">' +
        '<circle cx="' + (c.x + 9).toFixed(1) + '" cy="' + (c.y - 8).toFixed(1) +
          '" r="7.5" fill="var(--page, #fff)" stroke="currentColor" stroke-width="1.2"/>' +
        '<text x="' + (c.x + 9).toFixed(1) + '" y="' + (c.y - 5).toFixed(1) +
          '" fill="currentColor" font-size="9.5" font-weight="700" text-anchor="middle">' +
          c.count + '</text>' +
        '<title>' + escapeHtml(c.count + ' decisions here: ' +
          (c.numbers.length > 8
            ? c.numbers.slice(0, 8).join(', ') + ' and ' + (c.numbers.length - 8) + ' more'
            : c.numbers.join(', ')) +
          ' \u2014 ' + (c.wins === c.count ? 'all won' : c.wins === 0 ? 'all lost'
                        : c.wins + ' won, ' + (c.count - c.wins) + ' lost') +
          '. Click to zoom in.') + '</title>' +
      '</g>';
  }

  /* THE FLAGS ARE DRAWN LAST, ON TOP OF EVERYTHING, AND STACKED.
   *
   * A numeral beside a five-pixel triangle is findable only by somebody already
   * looking for it. A flag says what the trade was without being hunted for: a
   * hairline down the whole chart at the moment of entry, and a chip at the top
   * carrying the side and the result.
   *
   * Chips are stacked rather than placed, because two entries minutes apart
   * would otherwise print one label over another and read as neither. Each one
   * takes the first row where it does not touch the chip already there. */
  if (flags.length) {
    const rows = [];
    const CHIP_H = 19;

    for (const f of flags) {
      const w = 8 + f.text.length * 6.1;      // monospace, near enough to measure
      const left = Math.min(Math.max(f.x - w / 2, PAD.left), PAD.left + s.plotW - w);

      let row = 0;
      while (rows[row] !== undefined && left < rows[row] + 6) row++;
      rows[row] = left + w;

      const top = PAD.top + 2 + row * CHIP_H;

      out +=
        // The guide runs from the chip to the fill, so the eye is led to the
        // candle rather than left to work out which one the chip means.
        '<line class="ch-guide ' + f.cls + '" x1="' + f.x.toFixed(1) + '" y1="' + (top + CHIP_H - 4) +
          '" x2="' + f.x.toFixed(1) + '" y2="' + f.y.toFixed(1) +
          '" stroke="currentColor" stroke-width="1" stroke-dasharray="2 3" opacity="0.55"/>' +
        '<g class="ch-flag ' + f.cls + '">' +
          '<rect x="' + left.toFixed(1) + '" y="' + top + '" width="' + w.toFixed(1) +
            '" height="' + (CHIP_H - 4) + '" rx="3" fill="currentColor" opacity="0.14"/>' +
          '<rect x="' + left.toFixed(1) + '" y="' + top + '" width="2.5" height="' + (CHIP_H - 4) +
            '" rx="1" fill="currentColor"/>' +
          '<text x="' + (left + 7).toFixed(1) + '" y="' + (top + CHIP_H - 9) +
            '" fill="currentColor" font-size="11" font-weight="600">' +
            escapeHtml(f.text) + '</text>' +
        '</g>';
    }
  }

  if (unasked) {
    console.warn('chart.js: ' + unasked + ' of ' + decisions.length +
      ' trades arrived without entry/exit_price FIELDS - the query did not ask for them. ' +
      'This is a bug in the page, not missing data.');
  }

  return { html: out, drawn, unasked, key };
}

/* One line per decision, under the chart, in the order the numbers run.
 *
 * Monospace and fixed order: time, side, size, in, out, result. A member
 * scanning for "which one was the loser" is comparing the last column down a
 * list, and proportional type with the figures in different places each row
 * defeats that. */
function legend(key, { money: fmtMoney = money, picked = null } = {}) {
  if (!key.length) return '';

  return '<ol class="ch-key">' + key.map((k) =>
    '<li class="' + (k.won ? 'is-win' : 'is-loss') + ' ch-pick' +
      (picked && picked.includes(k.n) ? ' is-picked' : '') + '" tabindex="0" role="button" ' +
      'data-picks="' + k.n + '" data-from="' + k.from + '" data-to="' + k.to + '" ' +
      'title="Click to zoom in on this trade">' +
      '<span class="ch-key-n">' + k.n + '</span>' +
      '<span class="ch-key-side">' + (k.long ? 'long' : 'short') +
        (k.contracts ? ' ' + escapeHtml(String(k.contracts)) : '') + '</span>' +
      '<span class="ch-key-at">' + escapeHtml(k.at) + '</span>' +
      '<span class="ch-key-px">' +
        (k.entry === null ? '&mdash;' : escapeHtml(String(k.entry))) +
        (k.exit === null ? '' : ' &rarr; ' + escapeHtml(String(k.exit))) +
      '</span>' +
      '<span class="ch-key-val">' + escapeHtml(fmtMoney(k.value)) + '</span>' +
    '</li>').join('') + '</ol>';
}

/* ------------------------------ marks on it ------------------------------

   A note pinned to a moment: "added here", "this is where it went against me".
   Not a trade and not a day note - supabase/chart-marks.sql says why neither of
   those can hold it.

   LETTERS, NOT NUMBERS. Trades are numbered on this chart already, and a second
   run of numbers beside them would be two counting systems in one picture. A
   mark is A, B, C; a trade is 1, 2, 3; nothing has to be explained.
-------------------------------------------------------------------------- */

const markLetter = (i) => {
  // A..Z, then AA, AB. Twenty-seven marks on one session is unusual and should
  // still get a label rather than wrapping back to A.
  let n = i, out = '';
  do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return out;
};

/* ONE DEFINITION OF A CALLOUT'S BUBBLE, used by the view here and by the
 * Konva editor. The two draw the same thing in different technologies, and if
 * they disagreed about wrapping or size a callout would visibly jump the moment
 * the member pressed Done. */
export const BUBBLE = { font: 11.5, line: 15, pad: 7, perLine: 30, charW: 6.6, maxLines: 6 };

/** Wrap a callout's words into lines the bubble can hold. */
export function bubbleLines(text) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > BUBBLE.perLine && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > BUBBLE.maxLines) {
    lines.length = BUBBLE.maxLines;
    lines[BUBBLE.maxLines - 1] = lines[BUBBLE.maxLines - 1].replace(/.{0,2}$/, '') + '\u2026';
  }
  return lines.length ? lines : [''];
}

/** A bubble's size for these lines, in drawing units. */
export function bubbleSize(lines) {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return {
    w: Math.max(40, Math.round(longest * BUBBLE.charW + BUBBLE.pad * 2)),
    h: lines.length * BUBBLE.line + BUBBLE.pad * 2 - 3
  };
}

const inView = (m, s) => {
  const at = Date.parse(m.at);
  return Number.isFinite(at) && at >= s.t0 && at <= s.t1;
};

/* A drawing's own colour, if it has one. Validated against a short list rather
 * than written through, because this lands in an attribute on a page other
 * people's markup is never on - but a stored value is still data, and data is
 * not trusted to be a colour just because the editor only ever writes colours. */
const DRAW_COLOURS = ['accent', 'bull', 'bear', 'fg'];
function colourOf(m) {
  const c = m.style && m.style.color;
  return DRAW_COLOURS.includes(c) ? ' style="color: var(--' + c + ')"' : '';
}

function markLayer(marks, s, height) {
  if (!marks || !marks.length) return '';

  let out = '';
  marks.forEach((m, i) => {
    if (!inView(m, s)) return;

    const x = s.x(m.at);
    const letter = markLetter(i);
    const price = num(m.price);
    const hasPrice = Number.isFinite(price);
    const label = escapeHtml(letter + ' - ' + hhmm(m.at) +
      (hasPrice ? ' at ' + price : '') +
      (m.body ? ' - ' + m.body : '') + ' (click to edit)');

    /* A SHAPE: two corners rather than a point.
     *
     * What somebody actually draws on a chart is a region - the move, the
     * range, the bit where it went wrong. "I did this here" is an area, and a
     * pin at the corner of what they meant with the words carrying the rest is
     * the page deciding a shape was not worth storing.
     *
     * The rectangle is clamped to the plot rather than clipped away: a box
     * drawn round a move that runs off the left of a cropped view still has a
     * right-hand edge worth seeing, and a shape half outside the window should
     * say "it continues" rather than vanish. */
    /* An ARROW: tail at (at, price), head at (at_end, price_end). */
    if (m.kind === 'arrow') {
      const x2 = s.x(m.at_end);
      const y1 = s.y(price);
      const y2 = s.y(num(m.price_end));
      const ang = Math.atan2(y2 - y1, x2 - x);
      const head = 9;
      const h1 = [x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45)];
      const h2 = [x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45)];
      out +=
        '<g class="ch-mark ch-draw ch-pick" tabindex="0" role="button" data-mark="' + m.id + '"' +
          colourOf(m) + '>' +
          '<line x1="' + x.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) +
            '" y2="' + y2.toFixed(1) + '" stroke="currentColor" stroke-width="2.2" ' +
            'stroke-linecap="round"/>' +
          '<polygon points="' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' ' +
            h1.map((v) => v.toFixed(1)).join(',') + ' ' + h2.map((v) => v.toFixed(1)).join(',') +
            '" fill="currentColor"/>' +
          (m.body
            ? '<text x="' + (x + 4).toFixed(1) + '" y="' + (y1 - 6).toFixed(1) +
              '" fill="currentColor" font-size="11" font-weight="600">' +
              escapeHtml(m.body.slice(0, 40)) + '</text>'
            : '') +
          '<title>' + label + '</title>' +
        '</g>';
      return;
    }

    /* A CALLOUT: a bubble of words with a leader to the point it is about.
     * The point is (at, price) - that is what the member is talking about -
     * and the bubble's CENTRE is (at_end, price_end), placed wherever there
     * is room, which is usually not on top of the candles it describes. */
    if (m.kind === 'callout') {
      const bx = s.x(m.at_end);
      const by = s.y(num(m.price_end));
      const ay = s.y(price);
      const lines = bubbleLines(m.body || '');
      const size = bubbleSize(lines);
      const left = bx - size.w / 2;
      const top = by - size.h / 2;

      // The leader leaves the bubble from the edge nearest the point, so it
      // never crosses the words.
      const ex = Math.min(Math.max(x, left), left + size.w);
      const ey = Math.min(Math.max(ay, top), top + size.h);

      out +=
        '<g class="ch-mark ch-draw ch-pick" tabindex="0" role="button" data-mark="' + m.id + '"' +
          colourOf(m) + '>' +
          '<line x1="' + x.toFixed(1) + '" y1="' + ay.toFixed(1) + '" x2="' + ex.toFixed(1) +
            '" y2="' + ey.toFixed(1) + '" stroke="currentColor" stroke-width="1.4"/>' +
          '<circle cx="' + x.toFixed(1) + '" cy="' + ay.toFixed(1) + '" r="3" fill="currentColor"/>' +
          '<rect x="' + left.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + size.w +
            '" height="' + size.h + '" rx="5" fill="var(--paper, #fff)" stroke="currentColor" ' +
            'stroke-width="1.4"/>' +
          lines.map((l, i) =>
            '<text x="' + (left + BUBBLE.pad).toFixed(1) + '" y="' +
              (top + BUBBLE.pad + 9 + i * BUBBLE.line).toFixed(1) +
              '" fill="var(--fg, #111)" font-size="' + BUBBLE.font + '">' + escapeHtml(l) + '</text>'
          ).join('') +
          '<title>' + label + '</title>' +
        '</g>';
      return;
    }

    if (m.kind === 'box' || m.kind === 'line') {
      const x2 = s.x(m.at_end);
      const y1 = s.y(price);
      const y2 = s.y(num(m.price_end));

      const left = Math.max(Math.min(x, x2), PAD.left);
      const right = Math.min(Math.max(x, x2), PAD.left + s.plotW);
      const top = Math.max(Math.min(y1, y2), PAD.top);
      const bottom = Math.min(Math.max(y1, y2), PAD.top + s.plotH);

      if (m.kind === 'line') {
        out +=
          '<g class="ch-mark ch-shape ch-pick" tabindex="0" role="button" data-mark="' + m.id + '">' +
            '<line x1="' + x.toFixed(1) + '" y1="' + y1.toFixed(1) +
              '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
              '" stroke="currentColor" stroke-width="2" opacity="0.9"/>' +
            '<title>' + label + '</title>' +
          '</g>';
      } else {
        out +=
          '<g class="ch-mark ch-shape ch-draw ch-pick" tabindex="0" role="button" data-mark="' + m.id + '"' +
            colourOf(m) + '>' +
            '<rect x="' + left.toFixed(1) + '" y="' + top.toFixed(1) +
              '" width="' + Math.max(1, right - left).toFixed(1) +
              '" height="' + Math.max(1, bottom - top).toFixed(1) +
              '" rx="2" fill="currentColor" fill-opacity="0.10" ' +
              'stroke="currentColor" stroke-width="1.4"/>' +
            '<title>' + label + '</title>' +
          '</g>';
      }

      /* The letter sits on the top-left corner, outside the shape where there
       * is usually a candle underneath rather than on top of it. */
      out +=
        '<g class="ch-mark ch-draw ch-pick" tabindex="0" role="button" data-mark="' + m.id + '">' +
          '<rect x="' + (left - 1).toFixed(1) + '" y="' + (top - 15).toFixed(1) +
            '" width="16" height="14" rx="3" fill="currentColor"/>' +
          '<text x="' + (left + 7).toFixed(1) + '" y="' + (top - 4.5).toFixed(1) +
            '" fill="var(--page, #fff)" font-size="10" font-weight="700" ' +
            'text-anchor="middle">' + letter + '</text>' +
          (m.body
            ? '<text class="ch-shape-label" x="' + (left + 19).toFixed(1) + '" y="' +
              (top - 4.5).toFixed(1) + '" fill="currentColor" font-size="10.5">' +
              escapeHtml(m.body.slice(0, 40)) + '</text>'
            : '') +
          '<title>' + label + '</title>' +
        '</g>';
      return;
    }

    const chip = (cx, cy) =>
      '<rect x="' + (cx - 8).toFixed(1) + '" y="' + cy.toFixed(1) +
        '" width="16" height="14" rx="3" fill="currentColor"/>' +
      '<text x="' + cx.toFixed(1) + '" y="' + (cy + 10.5).toFixed(1) +
        '" fill="var(--page, #fff)" font-size="10" font-weight="700" ' +
        'text-anchor="middle">' + letter + '</text>';

    if (!hasPrice) {
      /* A mark about a TIME rather than a level: a line down the whole chart.
       * "The afternoon was a mistake" has no price to sit at, and giving it one
       * would invent a claim the member did not make. */
      out +=
        '<g class="ch-mark ch-pick" tabindex="0" role="button" data-mark="' + m.id + '">' +
          '<line x1="' + x.toFixed(1) + '" y1="' + PAD.top + '" x2="' + x.toFixed(1) +
            '" y2="' + (height - PAD.bottom) + '" stroke="currentColor" stroke-width="1" ' +
            'stroke-dasharray="4 4" opacity="0.7"/>' +
          chip(x, height - PAD.bottom - 16) +
          '<title>' + label + '</title>' +
        '</g>';
      return;
    }

    const y = s.y(price);
    out +=
      '<g class="ch-mark ch-pick" tabindex="0" role="button" data-mark="' + m.id + '">' +
        // A stalk, so the chip points at the level instead of covering it.
        '<line x1="' + x.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + x.toFixed(1) +
          '" y2="' + (y - 16).toFixed(1) + '" stroke="currentColor" stroke-width="1.2" opacity="0.8"/>' +
        '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.6" fill="currentColor"/>' +
        chip(x, y - 30) +
        '<title>' + label + '</title>' +
      '</g>';
  });

  return out;
}

/** The marks in view, listed under the chart, lettered as they are drawn. */
function markList(marks, s) {
  const shown = (marks || []).map((m, i) => ({ m, letter: markLetter(i) }))
    .filter(({ m }) => inView(m, s));
  if (!shown.length) return '';

  return '<ul class="ch-marks">' + shown.map(({ m, letter }) =>
    '<li class="ch-pick" tabindex="0" role="button" data-mark="' + m.id + '" ' +
      'title="Click to edit or delete">' +
      '<span class="ch-mark-n">' + letter + '</span>' +
      '<span class="ch-mark-at">' + escapeHtml(hhmm(m.at)) +
        (m.at_end ? ' to ' + escapeHtml(hhmm(m.at_end)) : '') +
        (Number.isFinite(num(m.price)) ? ' at ' + escapeHtml(String(m.price)) : '') +
      '</span>' +
      /* A shape with no words is still a row here, named by what it is. Without
       * this it would be a blank line in the list and unreachable by anybody
       * who cannot hit a rectangle with a mouse. */
      '<span class="ch-mark-body">' +
        (m.body ? escapeHtml(m.body)
                : '<span class="acct-muted">' +
                  (m.kind === 'box' ? 'box' : m.kind === 'line' ? 'line' : 'mark') +
                  ' with no note</span>') +
      '</span>' +
    '</li>').join('') + '</ul>';
}

/* --------------------------------- charts -------------------------------- */

/**
 * Candles with the day's decisions on them.
 *
 * `bars`      rows from market_bars, ascending, already trimmed to one session
 * `decisions` de-duplicated trades - distinctDecisions(), never raw rows
 * `value`     what a trade was worth, so dollars and R can both be drawn
 */
export function barChart(bars, decisions, { symbol, value, fmt, view = 'fit', zoom = null,
                                            picked = null, marks = null,
                                            width = 1200, height = 470 } = {}) {
  if (!bars || !bars.length) return '';

  const allDecisions = decisions;
  const full = bars;
  const crop = zoom
    ? { bars: zoomToWindow(full, zoom.from, zoom.to), cropped: true, zoomed: true }
    : view === 'all'
      ? { bars: full, cropped: false }
      : cropToTrades(full, decisions, marks);
  bars = crop.bars;
  if (!bars.length) bars = full;

  /* ONLY WHAT IS IN VIEW GETS A SAY IN THE SCALE.
   *
   * The price axis grows to include the fills, which is right - a marker off the
   * top would otherwise be clipped away in silence. Zoomed in, that rule turned
   * against the view: a trade four hours later at a price two hundred points
   * away still stretched the axis, and the ten candles being looked at were
   * squashed into a band. A decision outside the window is not in the picture
   * and must not shape it.
   *
   * The numbers are still the day's, so trade 21 is trade 21 at every zoom. */
  const numbers = new Map();
  allDecisions.slice()
    .sort((a, b) => new Date(a.opened_at) - new Date(b.opened_at))
    .forEach((d, i) => numbers.set(d, i + 1));

  const firstTs = new Date(bars[0].ts).getTime();
  const lastTs = new Date(bars[bars.length - 1].ts).getTime() + 5 * 60 * 1000;
  decisions = allDecisions.filter((d) => {
    const t = Date.parse(d.opened_at);
    return !Number.isFinite(t) || (t >= firstTs && t <= lastTs);
  });

  const s = scales(bars, decisions, width, height);
  const from = hhmm(bars[0].ts);
  const to = hhmm(bars[bars.length - 1].ts);

  /* Flags on a quiet day, numerals on a busy one, the list always.
   *
   * A flag is readable and expensive in space: eight of them stacked is most of
   * the top of the chart. Past that the numerals do the job of saying WHICH
   * candle, and the key underneath does the job of saying what it was. */
  const fmtValue = fmt || money;
  const marksDrawn = markers(decisions, s, value, {
    flag: decisions.length <= 8,
    number: decisions.length > 8 && decisions.length <= 24,
    fmtValue, height, picked, numbers
  });

  /* SCALED PROPORTIONALLY, not stretched.
   *
   * This drew with preserveAspectRatio="none", which fits the box exactly and
   * stretches everything in it - including the letters, which came out wide and
   * thin and, on the axis, unreadable. `meet` keeps the drawing's own shape; the
   * CSS gives the width and lets the height follow.
   *
   * The viewBox is wider than it was for the same reason the labels were
   * colliding: a 23-hour session needs the room. */
  return '<figure class="ch-figure">' +
    /* THE SCALE IS PUBLISHED ON THE ELEMENT, so a click on the chart can be
     * turned back into a moment and a price. The page cannot ask a string of
     * markup what the point 400,120 means, and handing it four numbers is
     * cheaper than exporting a live object and keeping the two in step. */
    '<svg class="ch-svg" viewBox="0 0 ' + width + ' ' + height + '" ' +
      'preserveAspectRatio="xMidYMid meet" role="img" ' +
      'data-symbol="' + escapeHtml(symbol) + '" ' +
      'data-t0="' + s.t0 + '" data-t1="' + s.t1 + '" ' +
      'data-lo="' + s.lo + '" data-hi="' + s.hi + '" ' +
      'data-pad-left="' + PAD.left + '" data-pad-top="' + PAD.top + '" ' +
      'data-plot-w="' + s.plotW + '" data-plot-h="' + s.plotH + '" ' +
      'aria-label="' + escapeHtml(symbol + ' five-minute candles from ' + from + ' to ' + to +
        ', with ' + marksDrawn.drawn + ' of your ' +
        (decisions.length === 1 ? 'decision' : 'decisions') + ' marked') + '">' +
      priceAxis(s, width) +
      candles(bars, s) +
      marksDrawn.html +
      markLayer(marks, s, height) +
      timeAxis(s, bars, height) +
    '</svg>' +
    '<figcaption class="stat-note">' + escapeHtml(symbol) + ' 5-minute candles, ' +
      escapeHtml(from) + ' to ' + escapeHtml(to) + '. ' +
      /* A cropped axis must never pass as the whole day. It says what it is
       * showing, out of what, and offers the rest. */
      (crop.zoomed
        ? 'Zoomed in' + (picked && picked.length
            ? ' on ' + (picked.length === 1 ? 'trade ' + picked[0]
                        : picked.length + ' trades') : '') +
          '. <button type="button" class="link-button" data-chart-view="fit">' +
          'Back to the day</button>. '
        : crop.cropped
        ? 'Fitted to your trading, out of a session running ' +
          escapeHtml(hhmm(full[0].ts)) + ' to ' + escapeHtml(hhmm(full[full.length - 1].ts)) +
          '. <button type="button" class="link-button" data-chart-view="all">' +
          'Show the whole session</button>. '
        : view === 'all' && cropToTrades(full, decisions, marks).cropped
          ? '<button type="button" class="link-button" data-chart-view="fit">' +
            'Fit to your trading</button>. '
          : '') +
      /* WHAT IS AND IS NOT ON THE PICTURE.
       *
       * A decision with neither an entry nor an exit price cannot be placed
       * anywhere, and saying nothing about it leaves a chart that looks like a
       * quiet day over a journal that says otherwise. */
      (decisions.length !== allDecisions.length
        ? marksDrawn.drawn + ' of the day’s ' + allDecisions.length +
          ' decisions are in this view, marked at your own fill prices.'
        : marksDrawn.drawn === decisions.length
        ? marksDrawn.drawn + (marksDrawn.drawn === 1 ? ' decision marked' : ' decisions marked') +
          ' at your own fill prices, not at the candle.'
        : marksDrawn.unasked
          /* Say which of the two it is. "No price recorded" sends somebody to
           * re-import a file that was always fine. */
          ? marksDrawn.drawn + ' of ' + decisions.length + ' decisions marked &mdash; this page did ' +
            'not ask the database for fill prices, which is a fault here rather than anything ' +
            'missing from your journal.'
          : marksDrawn.drawn + ' of ' + decisions.length + ' decisions marked &mdash; the rest have ' +
            'no entry or exit price recorded, so there is nowhere on the chart to put them.') +
    '</figcaption>' +
    markList(marks, s) +
    legend(marksDrawn.key, { money: fmt || money, picked }) +
  '</figure>';
}

/**
 * The same day with no candles behind it.
 *
 * Not an error state and not a placeholder: for an untracked symbol this is the
 * only chart there will ever be, and it still answers where the entries sat
 * against each other and how the day ran.
 */
export function tradeMap(decisions, { value, fmt, width = 1200, height = 340 } = {}) {
  const usable = decisions.filter((d) => Number.isFinite(num(d.entry)));
  if (!usable.length) return '';

  const times = usable.flatMap((d) => [new Date(d.opened_at).getTime(),
                                       new Date(d.closed_at || d.opened_at).getTime()]);
  const prices = usable.flatMap((d) => [num(d.entry), num(d.exit_price)])
    .filter((v) => Number.isFinite(v));

  const pad = (Math.max(...prices) - Math.min(...prices)) * 0.12 || 1;
  const fake = [{ ts: new Date(Math.min(...times) - 60000).toISOString(),
                  low: Math.min(...prices) - pad, high: Math.max(...prices) + pad },
                { ts: new Date(Math.max(...times) + 60000).toISOString(),
                  low: Math.min(...prices) - pad, high: Math.max(...prices) + pad }];

  const s = scales(fake, usable, width, height);
  const marksDrawn = markers(usable, s, value, {
    flag: usable.length <= 8,
    number: usable.length > 8 && usable.length <= 24,
    fmtValue: fmt || money
  });

  const first = Math.min(...times);
  const last = Math.max(...times);

  return '<figure class="ch-figure">' +
    '<svg class="ch-svg" viewBox="0 0 ' + width + ' ' + height + '" ' +
      'preserveAspectRatio="xMidYMid meet" role="img" ' +
      'aria-label="' + escapeHtml(usable.length + ' ' +
        (usable.length === 1 ? 'decision' : 'decisions') +
        ' by time and price, ' + hhmm(first) + ' to ' + hhmm(last)) + '">' +
      priceAxis(s, width) +
      marksDrawn.html +
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
    legend(marksDrawn.key, { money: fmt || money }) +
  '</figure>';
}
