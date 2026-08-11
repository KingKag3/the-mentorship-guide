#!/usr/bin/env python3
"""Build a page that checks analytics.js against values worked out here.

The point is not that the two agree - it is that they were arrived at
separately. A test that reimplements the code it is testing proves the typing
was consistent and nothing else. These expectations come from the CSV by a
different route, in a different language.

The bootstrap is seeded with the same tiny LCG on both sides, because a random
number generator nobody can hold still is a result nobody can check.
"""
import csv, datetime as dt, json, math, pathlib, statistics

CSV = pathlib.Path(r"C:\Users\Kag3\Downloads\trade-karma-mock-3-months.csv")
OUT = pathlib.Path(r"R:\the mentorship\_analytics-check.html")


def money(s):
    v = float(s.replace("$", "").replace("(", "").replace(")", "").replace(",", ""))
    return -v if "(" in s else v


ts = lambda s: dt.datetime.strptime(s, "%m/%d/%Y %H:%M:%S")

trades = []
for i, r in enumerate(csv.DictReader(CSV.open(newline="", encoding="utf-8"))):
    b, s_ = ts(r["boughtTimestamp"]), ts(r["soldTimestamp"])
    direction = "long" if b < s_ else "short"
    opened, closed = (b, s_) if direction == "long" else (s_, b)
    trades.append({
        "id": i + 1,
        "opened_at": opened.isoformat(),
        "closed_at": closed.isoformat(),
        "net_pnl": money(r["pnl"]),
        "account": "Sim",
    })

vals = [t["net_pnl"] for t in trades]
n = len(vals)
wins = sum(1 for v in vals if v > 0)
losses = sum(1 for v in vals if v < 0)
total = sum(vals)


def wilson(w, k, z=1.96):
    p = w / k
    d = 1 + z * z / k
    centre = p + z * z / (2 * k)
    spread = z * math.sqrt(p * (1 - p) / k + z * z / (4 * k * k))
    return [max(0.0, (centre - spread) / d), min(1.0, (centre + spread) / d)]


mean = total / n
sd = statistics.stdev(vals)
t_stat = (mean / sd) * math.sqrt(n)

# Peak to trough, in the order taken.
curve = peak = worst = 0.0
for v in vals:
    curve += v
    peak = max(peak, curve)
    worst = max(worst, peak - curve)


class LCG:
    """MINSTD, chosen so JavaScript can do the same arithmetic exactly.

    The obvious glibc constants overflow a double: 1103515245 * 2^31 is about
    2.4e18, well past 2^53, so JS silently rounds and the two languages diverge.
    48271 * 2^31 is 1.0e14 and stays exact on both sides."""
    def __init__(self, seed): self.x = seed
    def next(self):
        self.x = (self.x * 48271) % 2147483647
        return self.x / 2147483647


RUNS = 500
rng = LCG(42)
totals = []
for _ in range(RUNS):
    s = 0.0
    for _ in range(n):
        s += vals[int(rng.next() * n)]
    totals.append(s)
totals.sort()
boot = {
    "negative": sum(1 for x in totals if x <= 0) / RUNS,
    "low": totals[int(0.05 * RUNS)],
    "median": totals[int(0.5 * RUNS)],
    "high": totals[int(0.95 * RUNS)],
}

holds = [(dt.datetime.fromisoformat(t["closed_at"]) -
          dt.datetime.fromisoformat(t["opened_at"])).total_seconds() for t in trades]
win_holds = [h for h, t in zip(holds, trades) if t["net_pnl"] > 0]
loss_holds = [h for h, t in zip(holds, trades) if t["net_pnl"] < 0]

# Trades per local day, and the sequence position of the very last trade.
by_day = {}
for t in trades:
    by_day.setdefault(t["opened_at"][:10], []).append(t)

expected = {
    "n": n, "wins": wins, "losses": losses,
    "total": round(total, 2),
    "avg": round(mean, 6),
    "winRate": round(wins / n * 100, 6),
    "wilson": [round(x, 6) for x in wilson(wins, n)],
    "tStat": round(t_stat, 6),
    "drawdown": round(worst, 2),
    "medianWinHold": statistics.median(win_holds),
    "medianLossHold": statistics.median(loss_holds),
    "days": len(by_day),
    "maxPerDay": max(len(v) for v in by_day.values()),
    "boot": {k: (round(v, 6) if k == "negative" else round(v, 2)) for k, v in boot.items()},
}

page = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>analytics.js check</title>
<style>
 body{font:14px/1.6 ui-monospace,Consolas,monospace;background:#0d1117;color:#d6d8db;padding:24px}
 h1{font-size:16px} .ok{color:#35a86e} .bad{color:#e2515a;font-weight:700}
 table{border-collapse:collapse;margin-top:12px} td{padding:3px 14px 3px 0;vertical-align:top}
</style></head><body>
<h1>analytics.js against values computed in Python</h1>
<div id="out">running...</div>
<script type="module">
import { summarise, drawdown, median, wilson, tStat, bootstrap,
         sequence, holdSeconds, groupBy, hhmm, humanSeconds } from './analytics.js';

const trades = TRADES__;
const expected = EXPECTED__;
const value = (r) => Number(r.net_pnl);

// MINSTD. Every intermediate stays under 2^53, so this is exact in a double
// and matches the Python side bit for bit. The glibc constants do not.
function LCG(seed) { let x = seed;
  return () => { x = (x * 48271) % 2147483647; return x / 2147483647; }; }

const rows = [];
const check = (name, got, want, tol = 1e-6) => {
  const ok = typeof want === 'number'
    ? Math.abs(got - want) <= tol
    : JSON.stringify(got) === JSON.stringify(want);
  rows.push([name, got, want, ok]);
};

const s = summarise(trades, value);
check('n', s.n, expected.n);
check('wins', s.wins, expected.wins);
check('losses', s.losses, expected.losses);
check('total', Math.round(s.total * 100) / 100, expected.total, 0.01);
check('avg', s.avg, expected.avg, 1e-6);
check('winRate', s.winRate, expected.winRate, 1e-6);

const w = wilson(s.wins, s.n).map((x) => Math.round(x * 1e6) / 1e6);
check('wilson low', w[0], expected.wilson[0], 1e-6);
check('wilson high', w[1], expected.wilson[1], 1e-6);

check('tStat', tStat(trades.map(value)), expected.tStat, 1e-6);
check('drawdown', Math.round(drawdown(trades, value) * 100) / 100, expected.drawdown, 0.01);

const dayOf = (r) => r.opened_at.slice(0, 10);
const { seq } = sequence(trades, dayOf);
check('days', groupBy(trades, dayOf).size, expected.days);
check('max trades in a day', Math.max(...[...seq.values()]), expected.maxPerDay);

const holds = trades.map(holdSeconds);
const winH = trades.filter((t) => value(t) > 0).map(holdSeconds);
const lossH = trades.filter((t) => value(t) < 0).map(holdSeconds);
check('median winner hold', median(winH), expected.medianWinHold, 0.5);
check('median loser hold', median(lossH), expected.medianLossHold, 0.5);

const b = bootstrap(trades.map(value), 500, LCG(42));
check('bootstrap negative', Math.round(b.negative * 1e6) / 1e6, expected.boot.negative, 1e-6);
check('bootstrap low', Math.round(b.low * 100) / 100, expected.boot.low, 0.01);
check('bootstrap median', Math.round(b.median * 100) / 100, expected.boot.median, 0.01);
check('bootstrap high', Math.round(b.high * 100) / 100, expected.boot.high, 0.01);

check('humanSeconds 45', humanSeconds(45), '45 sec');
check('humanSeconds 600', humanSeconds(600), '10 min');
check('humanSeconds 7200', humanSeconds(7200), '2.0 hr');
check('hhmm 9', hhmm(9), '09:00');
check('median empty', median([]), null);
check('bootstrap too few', bootstrap([1,2,3], 10, LCG(1)), null);

const failed = rows.filter((r) => !r[3]).length;
document.getElementById('out').innerHTML =
  '<p class="' + (failed ? 'bad' : 'ok') + '">' +
  (failed ? failed + ' FAILED of ' + rows.length : 'all ' + rows.length + ' checks passed') +
  '</p><table>' + rows.map((r) =>
    '<tr><td>' + (r[3] ? '<span class="ok">ok</span>' : '<span class="bad">FAIL</span>') +
    '</td><td>' + r[0] + '</td><td>' + JSON.stringify(r[1]) +
    '</td><td>' + (r[3] ? '' : 'want ' + JSON.stringify(r[2])) + '</td></tr>').join('') +
  '</table>';
</script></body></html>
"""

page = page.replace("TRADES__", json.dumps(trades)).replace("EXPECTED__", json.dumps(expected))
OUT.write_text(page, encoding="utf-8", newline="\n")

print(OUT)
print("  trades      ", n)
print("  win rate    ", round(wins / n * 100, 1), "%")
print("  total       ", round(total, 2))
print("  t-stat      ", round(t_stat, 3))
print("  drawdown    ", round(worst, 2))
print("  wilson      ", [round(x * 100, 1) for x in wilson(wins, n)])
print("  boot neg    ", round(boot["negative"] * 100, 1), "%")
print("  median hold ", "win", round(statistics.median(win_holds)),
      "loss", round(statistics.median(loss_holds)))
