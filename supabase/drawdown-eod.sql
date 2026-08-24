-- ===========================================================================
-- Not every trailing drawdown trails the same thing
--
-- Run in the Supabase SQL editor after prop-accounts.sql. Safe to re-run.
--
--
-- WHY THIS EXISTS
--
-- `drawdown_type` has been on this table since the beginning, defaulting to
-- 'trailing', and nothing has ever read it or written it. So the accounts page
-- models one drawdown for everybody - and it models the intraday one, which is
-- why every caveat on that page says the same thing:
--
--     the real one is at least this bad and can be considerably worse
--
-- That is true of an intraday trailing drawdown and it is NOT true of an
-- end-of-day one, and the difference matters in the direction nobody expects:
-- the page is currently frightening people about a number that, on an EOD
-- account, it can compute exactly.
--
--
-- THE TWO SHAPES
--
--   INTRADAY TRAILING. The high-water mark follows your equity while a
--   position is open, unrealised profit included. A trade that ran $800 in
--   your favour and closed at $200 moved the threshold by $800, and a journal
--   only ever saw the $200. Anything computed from closed trades is therefore
--   a FLOOR on how bad the drawdown really is, and the room left is a CEILING.
--
--   END-OF-DAY TRAILING. The mark only moves when the day closes. Intraday
--   spikes do not touch it. If every trade has been imported and nothing was
--   carried overnight, the end-of-day balances a journal holds ARE the numbers
--   the firm used - so the figure is exact rather than a floor, and saying it
--   might be considerably worse is a lie that costs somebody sleep.
--
-- The distinction is not academic on this project. Nineteen accounts here are
-- one type; the same member's next account may be the other, and the two look
-- identical on a dashboard.
--
--
-- WHAT THIS FILE DOES NOT SETTLE
--
-- Which of Apex's products is which, and what each one's payout parameters
-- are. That is per-product data behind a bot check this project cannot read,
-- and the last rule seeded here on trust was contradicted by the member's own
-- account table inside a day. Every payout figure stays a field the member
-- fills in from their own dashboard, exactly as it is today.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. `eod` becomes a kind of drawdown
--
-- Dropped and recreated rather than altered, the same shape account-kind.sql
-- used, so re-running this file is safe.
--
-- 'trailing' keeps its name and its meaning - intraday - because renaming it
-- would silently reclassify every account already configured, and a migration
-- that changes what somebody's drawdown means without asking is exactly the
-- thing this project keeps refusing to do.
-- ---------------------------------------------------------------------------

alter table public.prop_accounts
  drop constraint if exists prop_accounts_drawdown_type_check;

alter table public.prop_accounts
  add constraint prop_accounts_drawdown_type_check
  check (drawdown_type in ('trailing', 'eod', 'static', 'daily'));

comment on column public.prop_accounts.drawdown_type is
  'trailing: the mark follows intraday equity, unrealised profit included, so '
  'anything computed from closed trades is a floor. eod: the mark moves only '
  'when the day closes, so closed-trade daily balances are exactly what the '
  'firm used. static: a fixed floor that never moves. daily: a limit that '
  'resets each day. Defaults to trailing, which is the conservative reading - '
  'it is the one that reports a figure as a floor rather than as a fact.';


-- ---------------------------------------------------------------------------
-- 2. What existing data does
--
-- Nothing changes. Every row keeps whatever it had, which for every account
-- configured before today is the default 'trailing'. That is the conservative
-- classification: it keeps reporting the drawdown as a floor, which is right
-- for an intraday account and merely pessimistic for an EOD one.
--
-- Reclassifying is a decision only the member can make, because only they know
-- which product they bought. The accounts page asks.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 3. Checks worth running once
-- ---------------------------------------------------------------------------

-- a) The constraint takes the new value and still refuses nonsense.
--
-- select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--  where conrelid = 'public.prop_accounts'::regclass
--    and conname = 'prop_accounts_drawdown_type_check';

-- b) Nothing was reclassified behind anybody's back.
--
-- select drawdown_type, count(*)
--   from public.prop_accounts
--  group by drawdown_type
--  order by drawdown_type;
