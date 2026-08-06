-- ===========================================================================
-- CSV import
--
-- Run in the Supabase SQL editor after trade-accounts.sql. Safe to re-run.
--
-- One column and one constraint. Everything else an import needs already
-- exists: account, fees, net_pnl, and the trades table itself.
--
-- external_id is the broker's own identifier for a round turn. For Tradovate
-- that is the buy fill id and the sell fill id joined, which is unique per
-- trade and stable across exports — so re-importing an overlapping date range
-- updates the rows it already has rather than doubling a month.
--
-- The uniqueness is per user, not global. Two members can hold the same fill
-- id without colliding, which will happen the moment two of them export from
-- the same copied account.
-- ===========================================================================


alter table public.trades
  add column if not exists external_id text;

alter table public.trades
  add column if not exists imported_at timestamptz;

comment on column public.trades.external_id is
  'Broker identifier for the round turn, unique per user. Null for trades '
  'entered by hand. Tradovate: buyFillId + "-" + sellFillId.';

comment on column public.trades.imported_at is
  'When the row last arrived from a file. Null means it was typed.';


-- Partial, so the many hand-entered rows with a null external_id do not all
-- collide with each other.
create unique index if not exists trades_external_idx
  on public.trades (user_id, external_id)
  where external_id is not null;
