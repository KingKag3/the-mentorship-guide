/* ---------------------------------------------------------------------------
   analytics.js — the maths behind the statistics page

   Split out of stats.html for one reason above all others: it can be tested.
   Everything here is a pure function of its arguments, so it can be loaded on
   its own page and checked against numbers worked out independently. Inline in
   a page that needs a Supabase session, it could only ever be checked by
   looking at it and hoping.

   Nothing here touches the DOM, reads a global, or knows what a trade is
   measured in. The unit is a function passed in, because the same page has to
   answer in dollars for imported trades and in R for hand-logged ones.
   --------------------------------------------------------------------------- */

/* ------------------------------- grouping -------------------------------- */

/** Group rows by a key. Blank keys are dropped: "" is not a category. */
export function groupBy(list, keyFn) {
  const map = new Map();
  for (const row of list) {
    const key = keyFn(row);
    if (key === null || key === undefined || key === '') continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

/* -------------------------------- summary -------------------------------- */

/**
 * The shape of a set of trades in whatever unit `value` returns.
 *
 * Zero is neither a win nor a loss. A scratch is a real outcome and counting it
 * as either would move the win rate for something that made no money.
 */
export function summarise(list, value) {
  const n = list.length;
  const vs = list.map(value);
  const wins = vs.filter((v) => v > 0).length;
  const losses = vs.filter((v) => v < 0).length;
  const total = vs.reduce((a, b) => a + b, 0);
  return { n, wins, losses, total, winRate: n ? wins / n * 100 : 0, avg: n ? total / n : 0 };
}

/**
 * Worst peak-to-trough run, in the order the trades were actually taken.
 *
 * Returned positive, as a depth. Order is the whole point, which is why the
 * caller has to hand these over already sorted and why the statistics page
 * queries ascending rather than newest-first.
 */
export function drawdown(list, value) {
  let curve = 0, peak = 0, worst = 0;
  for (const row of list) {
    curve += value(row);
    peak = Math.max(peak, curve);
    worst = Math.max(worst, peak - curve);
  }
  return worst;
}

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ------------------------------ how certain ------------------------------ */

/**
 * Wilson score interval for a win rate.
 *
 * The textbook p ± z·√(p(1−p)/n) falls apart exactly where a trading journal
 * lives: small samples, and rates near 0% or 100%. It will hand back a lower
 * bound below zero and nobody notices, because a win rate of "-4% to 31%" still
 * looks like statistics.
 *
 * Wilson cannot leave [0, 1] and stays honest at n = 12, which matters because
 * the members with the fewest trades are the ones most likely to read a win
 * rate as a fact about themselves.
 */
export function wilson(wins, n, z = 1.96) {
  if (!n) return null;
  const p = wins / n;
  const d = 1 + z * z / n;
  const centre = p + z * z / (2 * n);
  const spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (centre - spread) / d), Math.min(1, (centre + spread) / d)];
}

/**
 * How many standard errors the average trade sits from zero.
 *
 * Van Tharp sells this as the System Quality Number. It is a one-sample
 * t-statistic, and calling it what it is means the caveats arrive with it:
 * it scales with √n, so the same edge looks stronger simply for having been
 * traded more often. That is not a flaw — it is the honest reason a good
 * system with thirty trades cannot yet prove anything.
 */
export function tStat(values) {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  return sd > 0 ? (mean / sd) * Math.sqrt(n) : null;
}

/**
 * Deal the same trades again, at random, with replacement, a few thousand
 * times, and see how often the period ends badly.
 *
 * It answers the question every trader has and almost none can put a number
 * on: how much of this was me. A member who made money in a quarter where 40%
 * of redeals lose has learned something a profit figure cannot tell them.
 *
 * The assumption — stated on the panel, not buried here — is that trades are
 * interchangeable draws from one process. They are not quite: people improve
 * and markets change. So it is a floor on the uncertainty rather than all of
 * it.
 *
 * `rng` is injectable so a test can pin it. Randomness that cannot be held
 * still cannot be checked.
 */
export function bootstrap(values, runs = 3000, rng = Math.random) {
  const n = values.length;
  if (n < 20) return null;

  const totals = new Array(runs);
  for (let i = 0; i < runs; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += values[(rng() * n) | 0];
    totals[i] = sum;
  }
  totals.sort((a, b) => a - b);

  const at = (q) => totals[Math.min(runs - 1, Math.floor(q * runs))];
  return {
    negative: totals.filter((t) => t <= 0).length / runs,
    low: at(0.05),
    median: at(0.5),
    high: at(0.95)
  };
}

/* -------------------------------- streaks --------------------------------
 *
 * A run of losses is the most reliably misread thing in a trading journal.
 * Seven in a row feels like something has broken; at a 40% win rate over 160
 * trades it is close to the single most likely longest run there is. People
 * change what they are doing over it, which is how a bad week turns into a bad
 * quarter.
 *
 * The comparison is cheap and the reassurance is real - and when the run
 * genuinely is unusual, the same number says so instead of soothing.
 */

/** The longest consecutive run for which `test` holds. Order matters. */
export function longestRun(values, test) {
  let best = 0, current = 0;
  for (const v of values) {
    current = test(v) ? current + 1 : 0;
    if (current > best) best = current;
  }
  return best;
}

/**
 * How a run compares to chance at the same win rate.
 *
 * Simulated rather than derived. The closed form for the longest run of
 * failures in n Bernoulli trials is an approximation with caveats at small n,
 * and n is always small here. Dealing it out is exact to the precision of the
 * number of runs, and can be explained to somebody in one sentence, which the
 * closed form cannot.
 */
export function streakOdds(n, winRate, observed, runs = 2000, rng = Math.random) {
  if (!n || winRate <= 0 || winRate >= 1) return null;

  const longest = new Array(runs);
  for (let i = 0; i < runs; i++) {
    let best = 0, current = 0;
    for (let j = 0; j < n; j++) {
      current = rng() < winRate ? 0 : current + 1;
      if (current > best) best = current;
    }
    longest[i] = best;
  }

  const mean = longest.reduce((a, b) => a + b, 0) / runs;
  return {
    typical: mean,
    atLeastObserved: longest.filter((x) => x >= observed).length / runs
  };
}

/* ------------------------------ trade shape ------------------------------ */

export function hhmm(hour) { return String(hour).padStart(2, '0') + ':00'; }

export function humanSeconds(s) {
  if (s === null || s === undefined) return '—';
  if (s < 90) return Math.round(s) + ' sec';
  if (s < 5400) return Math.round(s / 60) + ' min';
  return (s / 3600).toFixed(1) + ' hr';
}

/**
 * Where each trade sits in its own day, and what was taken immediately before
 * it. Two maps keyed by id, built in one pass over trades already in time
 * order.
 *
 * Sequence is per day rather than running, because "the fourth trade" means the
 * fourth this morning. The previous trade is NOT reset per day — the caller
 * decides whether a cross-day pair counts, and for tilt it should not: a fresh
 * morning is not a reaction to yesterday afternoon.
 */
export function sequence(chron, dayOf) {
  const seq = new Map();
  const prev = new Map();
  const counter = new Map();
  let last = null;

  for (const row of chron) {
    const day = dayOf(row);
    const n = (counter.get(day) || 0) + 1;
    counter.set(day, n);
    seq.set(row.id, n);
    prev.set(row.id, last);
    last = row;
  }
  return { seq, prev };
}

/** Seconds a position was open, or null when the close was never recorded. */
export function holdSeconds(row) {
  if (!row.closed_at) return null;
  const s = (new Date(row.closed_at) - new Date(row.opened_at)) / 1000;
  return Number.isFinite(s) && s >= 0 ? s : null;
}
