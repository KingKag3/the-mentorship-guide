-- ===========================================================================
-- Accounts, and a reported result
--
-- Run in the Supabase SQL editor after trade-exits.sql. Safe to re-run.
--
-- Two additions, for the same reason: the derived dollar figure is a model of
-- the trade, and the account statement is what happened.
--
--   account   which account the trade was taken in, so an evaluation, a
--             funded account and a live account can be totalled apart
--   net_pnl   the result as the broker reports it, when that is the number
--             that matters
--
-- net_pnl does not replace the derived figure. Both are kept, and the journal
-- shows the difference when they disagree — which is the point. A gap between
-- what the prices say and what the account paid is slippage, fees, a partial
-- fill that was never recorded, or a typo, and every one of those is worth
-- seeing rather than smoothing over.
-- ===========================================================================


alter table public.trades
  add column if not exists account text;

alter table public.trades
  add column if not exists net_pnl numeric;

comment on column public.trades.account is
  'Free text, like model and session. A member inventing a name for an account '
  'they keep using is a signal worth keeping, not a constraint violation.';

comment on column public.trades.net_pnl is
  'The result in account currency as reported, overriding the figure derived '
  'from prices. Null means use the derived one.';


-- Totals per account, per day, are the two questions this table now gets asked.
create index if not exists trades_account_idx
  on public.trades (user_id, account, opened_at desc);
