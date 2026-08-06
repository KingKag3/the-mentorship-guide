# Getting trades out of the platforms

Research for a CSV importer. What each platform can actually export, where it hides the button, and
what it leaves out.

Gathered 6 August 2026 from vendor documentation and journal-integration guides. **None of it has
been verified against a real export** — every path below should be walked once, with a real file,
before an importer is written against it. Sources are at the bottom.

---

## Why this matters more than it looks

A trader running one account can type. A trader running seventeen copied Apex accounts cannot, and
that is the case this is being built for.

The value is not the totals — those are near-identical across copies. It is the **outlier**. In one
observed portfolio, sixteen accounts were up roughly $4,300 and one was down $5,139. That divergence
is the entire reason per-account data is worth carrying, and it is invisible in an aggregate.

---

## Tradovate — the best target

The most complete export, and the one to build against first: it covers a **whole date range in one
file**, per account.

**Orders CSV**
Desktop client → account-name dropdown → gear icon → *Account reports* → **Orders** tab → set date
range and filters → *Download Report*.

**Export from Orders, not Performance.** The Performance tab produces a different, wrong-shaped file,
and it is the single most common import failure.

**Commissions are not in it.** They live in the separate *Cash history* file, which has to be merged
against the orders by hand or by the importer.

**Performance report** — Dashboard → *Reports* on the right-hand toolbar → dates → *Go* → CSV or PDF.
Gives P&L, trade count, win rate, drawdown and run-up. Useful as a reconciliation check against
`net_pnl`, not as a trade source.

**The API is the real answer at scale.** Tradovate exposes accounts, positions, orders and fills.
Copy-trading services already use one personal access token per account across several prop firms,
so seventeen accounts is a solved problem there rather than seventeen downloads. Tokens need
reauthorising after a password change.

---

## Rithmic (R\|Trader Pro) — works, but punishing

Matters because Apex accounts run on Rithmic underneath.

File → *Order History* → pick Account and Date → export via the ribbon button or the clipboard icon
→ CSV.

Two problems, both bad at scale:

- **One date at a time.** There is no range. Seventeen accounts across a twenty-day month is 340
  separate exports.
- **Hidden columns are silently dropped.** Right-click the grid header → *Add/Remove Columns* → tick
  everything → OK, *before* exporting. Leave the defaults and the file imports fine and arrives
  without commissions, which is the worst kind of failure: it looks correct.

Treat Rithmic as the fallback for accounts that cannot be reached any other way.

---

## Apex Trader Funding — no trade export

The Apex dashboard shows account metrics — P&L, trading days completed, trailing drawdown, balance,
target progress — and refreshes **nightly at midnight ET**. There is no trade-level CSV export.

So Apex is the wrong place to look. Trade data has to come from whichever platform the account is
traded through: Tradovate, Rithmic, or NinjaTrader.

---

## TradingView — fine, one tab at a time

Trading Panel at the bottom of the chart → broker dropdown → *Export data…* → choose **Order
History**.

Downloads as `order_history_YYYY-MM-DD.csv`. Each tab exports separately, and **Position History is
not the same file** — picking it is the usual mistake.

Paper trading data lives in browser local storage, so the export panel is the only supported way out
of it.

---

## WealthCharts

Paper Trading dashboard → *Trades* → *Export to CSV*.

Columns reported to include `symbol`, `price_done`, `qty_done`, `last_time`.

---

## NinjaTrader

Trade history lives in a SQLite database rather than behind an export button:

```
Documents\NinjaTrader 8\db\NinjaTrader.sqlite
```

Readable directly, which makes it the easiest to automate and the most awkward to document for a
member.

---

## What this means for the importer

**Build against the Tradovate Orders CSV first.** One file, whole date range, per account, and the
most likely source for these accounts.

**The schema is already the right shape.** `account`, `fees`, `net_pnl` and `trade_exits` map onto
what a broker export carries. `net_pnl` matters most: an import does not need entry and stop prices
to produce a usable calendar, because it can take the realised figure straight from the statement.

**Import every account, do not deduplicate copies.** The trades are near-identical by design, so the
instinct is to import one and multiply. Resist it — the one account that diverged is the only thing
worth knowing, and collapsing them hides exactly that.

**Fills map to `trade_exits`.** A broker export is a list of fills already, so the scale-out
structure is what an importer should build rather than something it has to flatten.

**Open question:** whether to match orders into round-turn trades in the importer, or store fills and
derive. The former is what most journals do; the latter is closer to how this schema already works.

---

## Sources

- [Tradovate CSV export guide, Journalit](https://journalit.co/docs/broker-guides-tradovate)
- [Tradovate performance reports, FundedNext](https://helpfutures.fundednext.com/en/articles/14297845-how-to-check-your-trading-performance-in-tradovate)
- [Tradovate API](https://api.tradovate.com/) and [API access, Tradovate support](https://support.tradovate.com/s/article/Tradovate-API-Access?language=en_US)
- [Trade copiers for multiple Tradovate accounts, QuantVPS](https://www.quantvps.com/blog/how-to-use-a-trade-copier-for-tradovate-accounts)
- [Rithmic completed orders export, Journalit](https://journalit.co/docs/broker-guides-rithmic)
- [Export all trades from R\|Trader, Optimus Futures community](https://community.optimusfutures.com/t/export-all-trades-order-history/5965)
- [Apex Trader Funding dashboard](https://apextraderfunding.com/help-center/getting-started/apex-trader-funding-dashboard/)
- [TradingView, exporting trading data](https://www.tradingview.com/support/solutions/43000663814-how-can-i-export-trading-data/)
- [TradingView paper trading export, Journalit](https://journalit.co/docs/broker-guides-tradingview)
- [WealthCharts integration notes, TradesViz](https://www.tradesviz.com/brokers/WealthCharts)
- [NinjaTrader trade performance storage, NinjaTrader forum](https://forum.ninjatrader.com/forum/ninjatrader-8/platform-technical-support-aa/1240041-where-is-trade-performance-trades-saved)
