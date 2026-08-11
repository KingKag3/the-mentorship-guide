#!/usr/bin/env python3
"""Three months of mock NQ round turns in Tradovate's Performance CSV shape.

WHY THE NUMBERS ARE NOT RANDOM

A file of coin-flips would import and would tell the statistics page nothing,
because there would be nothing in it to find. This has edges deliberately
buried in it, so the analytics can be checked against a known answer rather
than admired:

  * the 10:00-11:00 hour wins far more often than the rest of the session
  * 13:00-15:00 is the worst stretch of the day
  * Friday is worse than midweek
  * days that run past three trades get worse as they go - the overtrading tax

Everything else is noise on top. Seeded, so the file regenerates identically.

CONSISTENCY THAT MATTERS FOR THE IMPORT

pnl is computed from the fills rather than invented alongside them:

    pnl = (sellPrice - buyPrice) * qty * 20      NQ is $20 a point

If those two disagreed, the journal would import the trade and then report the
stated figure fighting the derived one - which is a real feature of the journal
and a terrible thing to trip on with test data.

Direction is carried the way this export carries it: whichever fill is stamped
first. A long is bought then sold; a short is sold then bought.
"""

import csv
import datetime as dt
import pathlib
import random

random.seed(20260810)

START = dt.date(2026, 5, 11)   # Monday
END = dt.date(2026, 8, 7)      # Friday
ROLL = dt.date(2026, 6, 11)    # June contract gives way to September

PER_POINT = 20.0
TICK = 0.25

# Where NQ sat over the period. A drift with a couple of drawdowns in it, so
# the equity curve is not a straight line and neither is the instrument.
LEVEL_START = 27_820.0
LEVEL_END = 29_430.0


def tick_round(x):
    return round(round(x / TICK) * TICK, 2)


def weekdays(a, b):
    d = a
    while d <= b:
        if d.weekday() < 5:
            yield d
        d += dt.timedelta(days=1)


DAYS = list(weekdays(START, END))


def level_for(day):
    """A drifting price path with noise and two visible pullbacks."""
    span = (END - START).days or 1
    t = (day - START).days / span
    base = LEVEL_START + (LEVEL_END - LEVEL_START) * t
    # Two drawdowns, so the period is not one clean run.
    for centre, depth, width in ((0.34, 620.0, 0.07), (0.71, 430.0, 0.05)):
        base -= depth * pow(2.718, -((t - centre) ** 2) / (2 * width * width))
    return base + random.gauss(0, 95)


def window_of(hour, minute):
    m = hour * 60 + minute
    if m < 9 * 60 + 30:
        return "premarket"
    if m < 10 * 60:
        return "open"
    if m < 11 * 60:
        return "silver"       # the good one
    if m < 12 * 60:
        return "late_morning"
    if m < 13 * 60:
        return "lunch"
    if m < 15 * 60:
        return "afternoon"    # the bad one
    return "close"


# Win rate by window. These are the edges the statistics page should surface.
WIN_RATE = {
    "premarket":    0.40,
    "open":         0.43,
    "silver":       0.60,
    "late_morning": 0.50,
    "lunch":        0.38,
    "afternoon":    0.35,
    "close":        0.40,
}

# Average points won and lost by window. The silver hour is not merely more
# often right, it is also better paid - two separate things a good stats page
# should be able to tell apart.
WIN_PTS = {
    "premarket": 11, "open": 14, "silver": 19, "late_morning": 12,
    "lunch": 8, "afternoon": 10, "close": 11,
}
LOSS_PTS = {
    "premarket": 9, "open": 11, "silver": 9, "late_morning": 10,
    "lunch": 9, "afternoon": 13, "close": 10,
}


def start_time(window):
    lo, hi = {
        "premarket":    (8 * 60 + 35, 9 * 60 + 25),
        "open":         (9 * 60 + 31, 9 * 60 + 58),
        "silver":       (10 * 60 + 2, 10 * 60 + 56),
        "late_morning": (11 * 60 + 2, 11 * 60 + 55),
        "lunch":        (12 * 60 + 5, 12 * 60 + 55),
        "afternoon":    (13 * 60 + 5, 14 * 60 + 55),
        "close":        (15 * 60 + 2, 15 * 60 + 50),
    }[window]
    m = random.randint(lo, hi)
    return m // 60, m % 60, random.randint(0, 59)


def pick_windows(n):
    """Which windows a day's trades land in, in time order."""
    pool = (["open"] * 3 + ["silver"] * 5 + ["late_morning"] * 3 +
            ["afternoon"] * 4 + ["premarket"] * 2 + ["lunch"] * 1 + ["close"] * 2)
    order = ["premarket", "open", "silver", "late_morning", "lunch", "afternoon", "close"]
    picks = [random.choice(pool) for _ in range(n)]
    return sorted(picks, key=order.index)


def duration_text(seconds):
    if seconds < 60:
        return "%dsec" % seconds
    if seconds < 3600:
        m, s = divmod(seconds, 60)
        return "%dmin %dsec" % (m, s) if s else "%dmin" % m
    h, rem = divmod(seconds, 3600)
    m = rem // 60
    return "%dhr %dmin" % (h, m) if m else "%dhr" % h


rows = []
fill_id = 611_824_210_000

for day in DAYS:
    # Not every weekday gets traded. Nobody trades every day, and a file that
    # says otherwise is the first thing that looks fake.
    if random.random() < 0.14:
        continue

    n = random.choices([1, 2, 3, 4, 5], weights=[16, 26, 26, 20, 12])[0]
    level = level_for(day)
    windows = pick_windows(n)

    for i, window in enumerate(windows):
        hh, mm, ss = start_time(window)

        p_win = WIN_RATE[window]
        # The slump. Mid-June to early July goes wrong and stays wrong, which
        # is how a bad patch actually arrives - not as scattered red days but
        # as a fortnight where nothing works.
        if dt.date(2026, 6, 15) <= day <= dt.date(2026, 7, 6):
            p_win -= 0.20
        # Friday tax.
        if day.weekday() == 4:
            p_win -= 0.06
        # The overtrading tax: the fourth trade of a day is worse than the
        # first, and the fifth is worse again.
        if i >= 3:
            p_win -= 0.09 * (i - 2)

        won = random.random() < max(0.12, p_win)

        mean = WIN_PTS[window] if won else LOSS_PTS[window]
        pts = abs(random.gauss(mean, mean * 0.45)) + 1.0
        if won and random.random() < 0.06:
            pts *= random.uniform(1.8, 3.0)      # the occasional runner
        if not won and random.random() < 0.05:
            pts *= random.uniform(1.6, 2.4)      # and the occasional bad one
        pts = tick_round(pts)

        qty = random.choices([1, 2, 3], weights=[58, 30, 12])[0]
        direction = "long" if random.random() < 0.54 else "short"

        entry = tick_round(level + random.gauss(0, 55))
        move = pts if won else -pts
        exit_px = tick_round(entry + move) if direction == "long" else tick_round(entry - move)

        if direction == "long":
            buy_px, sell_px = entry, exit_px
        else:
            sell_px, buy_px = entry, exit_px

        # The single most important line in this file: the stated result is
        # derived from the fills, not invented beside them.
        pnl = round((sell_px - buy_px) * qty * PER_POINT, 2)

        held = random.choice([
            random.randint(20, 90), random.randint(90, 600),
            random.randint(600, 2400), random.randint(2400, 5400)])

        opened = dt.datetime(day.year, day.month, day.day, hh, mm, ss)
        closed = opened + dt.timedelta(seconds=held)

        if direction == "long":
            bought_at, sold_at = opened, closed
        else:
            sold_at, bought_at = opened, closed

        fill_id += random.randint(3, 40)
        buy_id = fill_id
        fill_id += random.randint(3, 40)
        sell_id = fill_id

        symbol = "NQM6" if day < ROLL else "NQU6"
        money = ("$%.2f" % pnl) if pnl >= 0 else ("$(%.2f)" % abs(pnl))

        rows.append({
            "symbol": symbol,
            "_priceFormat": -2,
            "_priceFormatType": 0,
            "_tickSize": TICK,
            "buyFillId": buy_id,
            "sellFillId": sell_id,
            "qty": qty,
            "buyPrice": "%.2f" % buy_px,
            "sellPrice": "%.2f" % sell_px,
            "pnl": money,
            "boughtTimestamp": bought_at.strftime("%m/%d/%Y %H:%M:%S"),
            "soldTimestamp": sold_at.strftime("%m/%d/%Y %H:%M:%S"),
            "duration": duration_text(held),
            "_win": pnl > 0,
            "_window": window,
            "_dow": day.weekday(),
            "_date": day,
        })

rows.sort(key=lambda r: min(r["boughtTimestamp"], r["soldTimestamp"]))

COLS = ["symbol", "_priceFormat", "_priceFormatType", "_tickSize", "buyFillId",
        "sellFillId", "qty", "buyPrice", "sellPrice", "pnl", "boughtTimestamp",
        "soldTimestamp", "duration"]

out = pathlib.Path(r"C:\Users\Kag3\Downloads\trade-karma-mock-3-months.csv")
with out.open("w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=COLS, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow(r)

# ------------------------------- what it contains --------------------------

def money_of(r):
    s = r["pnl"]
    v = float(s.replace("$", "").replace("(", "").replace(")", "").replace(",", ""))
    return -v if "(" in s else v


total = sum(money_of(r) for r in rows)
wins = [r for r in rows if r["_win"]]
losses = [r for r in rows if not r["_win"]]
days_traded = len({r["_date"] for r in rows})

print(out)
print("  trades           %d over %d trading days (of %d weekdays)"
      % (len(rows), days_traded, len(DAYS)))
print("  win rate         %.1f%%" % (100 * len(wins) / len(rows)))
print("  net              ${:,.2f}".format(total))
print("  avg win / loss   $%.0f / $%.0f"
      % (sum(money_of(r) for r in wins) / len(wins),
         sum(money_of(r) for r in losses) / len(losses)))
print()
print("  by window        trades   win%    net")
order = ["premarket", "open", "silver", "late_morning", "lunch", "afternoon", "close"]
for w_ in order:
    sub = [r for r in rows if r["_window"] == w_]
    if not sub:
        continue
    print("    {:<14} {:4d}   {:5.1f}%  ${:,.0f}".format(
        w_, len(sub), 100 * sum(1 for r in sub if r["_win"]) / len(sub),
        sum(money_of(r) for r in sub)))
print()
print("  by weekday       trades   win%    net")
for i, name in enumerate(["Mon", "Tue", "Wed", "Thu", "Fri"]):
    sub = [r for r in rows if r["_dow"] == i]
    if not sub:
        continue
    print("    {:<14} {:4d}   {:5.1f}%  ${:,.0f}".format(
        name, len(sub), 100 * sum(1 for r in sub if r["_win"]) / len(sub),
        sum(money_of(r) for r in sub)))

# The invariant the journal will check, so check it here first.
bad = 0
for r in rows:
    derived = round((float(r["sellPrice"]) - float(r["buyPrice"])) * r["qty"] * PER_POINT, 2)
    if abs(derived - money_of(r)) > 0.005:
        bad += 1
print()
print("  fills agree with stated pnl:", "yes" if bad == 0 else "NO - %d rows" % bad)
