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

/* ==========================================================================
   THE PERMUTATION GATE
   ==========================================================================

   Everything above answers "how big is this". This answers the question that
   has to be asked first: would a pattern this big have turned up anyway.

   WHY THE PAGE NEEDS IT

   The findings engine tests six families - the clock, position in the day, the
   trade after a loss, hold time, the shape of the edge, the weekday - then
   ranks what it found by money and shows the top five. Nothing asks whether
   the worst of seven hours being bad is surprising. It is not. Pick the worst
   of seven groups of coin flips and it will look terrible, every time, for
   everybody. A page that reports that as a habit is inventing one.

   WHAT MOVES, AND WHY ONLY WITHIN A DAY

   The null being tested is "the label carries no information about the
   outcome". So the labels stay exactly where they are and the OUTCOMES move.

   They move only within their own day. Shuffling across the whole sample would
   throw away the fact that trades taken on one morning share a market, a
   regime and a mood - and a null that assumes trades are independent when they
   are not is too tight, which makes everything look significant. Held within
   the day, each day's total is untouched and the question narrows to the one
   worth asking: given what that day did, did it matter which hour, or which
   position in the sequence, it happened in.

   WHY THE EXTREME AND NOT EACH GROUP ON ITS OWN

   Testing each group separately and reporting whichever came out worst is the
   multiple-comparison error with extra steps. Instead every shuffle keeps the
   extreme across ALL eligible groups, and the observed extreme is read against
   that. The p that falls out has already paid for having looked at seven
   hours, because the null looked at seven too.

   That is a max-T permutation test, and it is the cheapest honest answer to
   "the worst of how many".

   WHAT IT CANNOT DO

   It cannot tell you the label caused anything. Size up at 09:30 and the 09:30
   effect is a size effect - this will call it real, because it is real, it is
   just not about the clock. Confounders stay the caller's problem.
   ========================================================================== */

/**
 * Fisher-Yates over the values inside each day, leaving every other column
 * where it is.
 *
 * Exported because a shuffler is only worth trusting if it can be checked, and
 * the two properties worth checking - that no value ever crosses a day
 * boundary, and that each day's total is therefore unchanged - are invisible
 * from outside a test that only reads a p value at the end.
 *
 * `blocks` holds arrays of indexes into `values`, and `out` is written in
 * place so a caller running two thousand of these allocates once.
 */
export function shuffleWithinBlocks(values, blocks, out, rng = Math.random) {
  out.set(values);
  for (const block of blocks) {
    for (let i = block.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const a = block[i];
      const b = block[j];
      const swap = out[a];
      out[a] = out[b];
      out[b] = swap;
    }
  }
  return out;
}

/**
 * Which groups are allowed to be looked at.
 *
 * Ten trades is the bar the rest of the page uses and on its own it is not
 * enough: ten trades taken across two days are not ten readings of a habit,
 * they are two days with a lot going on. So a group clears both a trade count
 * and a day count before it is eligible to be the extreme.
 *
 * Decided once, on the real data, and never recomputed. The shuffle moves
 * outcomes and leaves labels alone, so group sizes and day counts are
 * identical in every permutation by construction - which is what makes the
 * comparison fair, because the null is choosing its extreme from exactly the
 * same set of groups.
 */
function eligibleGroups(rows, labelOf, dayOf, minTrades, minDays) {
  const seen = new Map();
  for (let i = 0; i < rows.length; i++) {
    const key = labelOf(rows[i]);
    if (key === null || key === undefined || key === '') continue;
    if (!seen.has(key)) seen.set(key, { key, rows: [], days: new Set() });
    const group = seen.get(key);
    group.rows.push(i);
    group.days.add(dayOf(rows[i]));
  }

  const kept = [];
  const rejected = [];
  for (const group of seen.values()) {
    const record = { key: group.key, n: group.rows.length,
                     days: group.days.size, rows: group.rows };
    (record.n >= minTrades && record.days >= minDays ? kept : rejected).push(record);
  }
  return { kept, rejected };
}

/**
 * The gate itself. Returns the worst and the best group, each carrying a p
 * that has already paid for however many groups were looked at.
 *
 * `statistic` is 'total' or 'mean'. Total answers "what did this hour cost
 * me", which is usually the question being asked. Mean answers "what is one
 * trade in this hour worth", which is the one to reach for when group sizes
 * differ wildly and a total is really reporting how often something happened.
 *
 * p is (hits + 1) / (runs + 1). A permutation p is never zero - the observed
 * arrangement is itself one of the arrangements - and printing "p = 0" off two
 * thousand shuffles claims a precision that is not there.
 *
 * FEED IT DECISIONS, NOT ROWS. Eighteen copies of one trade are one decision,
 * for the reason distinctDecisions() gives, and passing the copies inflates
 * every count eighteenfold - which is the exact mistake this function exists
 * to prevent. It is also the difference between 170ms and two and a half
 * seconds at two thousand runs, measured, so the wrong unit is slow as well as
 * wrong. Six families on a collapsed journal costs about a second in total.
 */
export function permutationExtremes(rows, {
  labelOf, valueOf, dayOf,
  statistic = 'total',
  minTrades = 10,
  minDays = 5,
  runs = 2000,
  rng = Math.random
} = {}) {
  const { kept, rejected } = eligibleGroups(rows, labelOf, dayOf, minTrades, minDays);

  // One group cannot be an extreme among its peers, and nothing here is worth
  // saying about it. Reported rather than thrown, because "not enough to look
  // at yet" is an answer the page has to be able to print.
  if (kept.length < 2) {
    return { groups: [], rejected, runs: 0, eligible: kept.length,
             total: 0, worst: null, best: null };
  }

  const values = new Float64Array(rows.length);
  for (let i = 0; i < rows.length; i++) values[i] = Number(valueOf(rows[i])) || 0;

  // One block of indexes per day - the only thing the shuffle is allowed to
  // move within. A day holding a single trade can never be permuted, so it is
  // dropped from the block list rather than looped over two thousand times.
  const byDay = new Map();
  for (let i = 0; i < rows.length; i++) {
    const day = dayOf(rows[i]);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(i);
  }
  const blocks = [...byDay.values()].filter((block) => block.length > 1);

  const score = (indexes, from) => {
    let sum = 0;
    for (const i of indexes) sum += from[i];
    return statistic === 'mean' ? sum / indexes.length : sum;
  };

  const observed = kept.map((group) => ({
    key: group.key, n: group.n, days: group.days, value: score(group.rows, values)
  }));
  const observedLow = Math.min(...observed.map((g) => g.value));
  const observedHigh = Math.max(...observed.map((g) => g.value));

  const total = values.reduce((a, b) => a + b, 0);
  const chanceGains = [];

  let worseRuns = 0;
  let betterRuns = 0;
  const scratch = new Float64Array(rows.length);

  for (let run = 0; run < runs; run++) {
    shuffleWithinBlocks(values, blocks, scratch, rng);

    let low = Infinity;
    let high = -Infinity;
    let lowTotal = 0;
    for (const group of kept) {
      const value = score(group.rows, scratch);
      if (value < low) {
        low = value;
        lowTotal = statistic === 'mean' ? value * group.n : value;
      }
      if (value > high) high = value;
    }

    if (low <= observedLow) worseRuns++;
    if (high >= observedHigh) betterRuns++;
    chanceGains.push(lowTotal < 0 ? -lowTotal : 0);
  }

  const worst = observed.find((g) => g.value === observedLow);
  const best = observed.find((g) => g.value === observedHigh);
  const worstTotal = statistic === 'mean' ? observedLow * worst.n : observedLow;

  return {
    groups: [...observed].sort((a, b) => a.value - b.value),
    rejected,
    runs,
    eligible: kept.length,
    total,
    worst: {
      ...worst,
      p: (worseRuns + 1) / (runs + 1),
      /* J-03, answered with arithmetic instead of a warning.
       *
       * "Leave that hour alone and the period reads better" is true and it is
       * true for a random trader as well, because dropping the worst of seven
       * groups in hindsight always flatters the curve. `gainByChance` is by how
       * much - the same subtraction, done on shuffled outcomes - so the real
       * gain can be read against it rather than on its own. */
      gain: worstTotal < 0 ? -worstTotal : 0,
      gainByChance: median(chanceGains) ?? 0
    },
    best: { ...best, p: (betterRuns + 1) / (runs + 1) }
  };
}
