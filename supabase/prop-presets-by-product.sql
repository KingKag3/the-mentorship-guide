-- ===========================================================================
-- One size, two products, two different drawdowns
--
-- Run in the Supabase SQL editor after prop-preset-drawdown.sql and
-- drawdown-eod.sql. Safe to re-run.
--
--
-- WHY THIS EXISTS
--
-- `prop_presets` is keyed on (firm, size), and that key is wrong. Apex sells
-- more than one product at the same size and they do not trail the same
-- amount:
--
--     size        legacy      EOD      the preset would have filled in
--     $25,000      1,500     1,000     500 too much
--     $50,000      2,500     2,000     500 too much
--     $100,000     3,000     3,000     correct, by coincidence
--     $150,000     5,000     4,000     1,000 too much
--
-- Too much is the dangerous direction. A drawdown $1,000 larger than the real
-- one puts $1,000 of room on the card that the account does not have, and room
-- that is not there is the one error on that page that ends an account.
--
-- The same size can also differ by drawdown TYPE within the legacy range: a
-- $100,000 static account has a $2,500 drawdown where the $100,000 trailing
-- account has $3,000. So (firm, size) cannot identify a set of terms, and
-- never could.
--
--
-- WHY drawdown_type IS THE KEY AND NOT A NEW "PRODUCT" COLUMN
--
-- Because it already is the distinction. Legacy is the intraday trailing
-- product, EOD is the end-of-day trailing product, and static is static. A
-- separate `product` column would carry the same information under a second
-- name, and two columns that must agree are two columns that will not.
--
--
-- WHERE THESE NUMBERS COME FROM
--
-- Apex's own published payout tables, read on 18 August 2026. Every drawdown
-- below is DERIVED rather than quoted, because the tables publish the safety
-- net and the safety net is defined as the drawdown plus $100:
--
--   Legacy, from "Required Minimum Balance to Request a Payout":
--     $25k 26,600 | $50k 52,600 | $100k 103,100 | $150k 155,100
--     $250k 256,600 | $300k 307,600 | $100k static 102,600
--   less the account size, less $100, gives the seven drawdowns below.
--
--   EOD, from the "EOD Performance Account Payouts" table's Safety Net column:
--     $25k 26,100 | $50k 52,100 | $100k 103,100 | $150k 154,100
--   less the account size, less $100, gives four more.
--
-- This independently confirms all six trailing figures that were previously
-- seeded from the published ladder and marked unverified - they now agree with
-- Apex's own arithmetic in a table written for a different purpose, which is a
-- better check than the ladder itself.
--
-- $75,000 appears in NEITHER table and stays unconfirmed. It is seeded because
-- it was already seeded, and it is the one row on this list that is still just
-- a number somebody wrote down.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Re-key on the product
--
-- The existing rows are the legacy trailing ladder, so they take 'trailing' -
-- which is both correct and the conservative reading, since trailing reports
-- its figures as a floor.
-- ---------------------------------------------------------------------------

alter table public.prop_presets
  add column if not exists drawdown_type text not null default 'trailing';

alter table public.prop_presets
  drop constraint if exists prop_presets_drawdown_type_check;

alter table public.prop_presets
  add constraint prop_presets_drawdown_type_check
  check (drawdown_type in ('trailing', 'eod', 'static', 'daily'));

alter table public.prop_presets
  drop constraint if exists prop_presets_pkey;

alter table public.prop_presets
  add primary key (firm, size, drawdown_type);


-- ---------------------------------------------------------------------------
-- 2. The payout terms, per product
--
-- Separate columns rather than a blob, the same reasoning funded-accounts.sql
-- gives: each is a number with a name, each is shown on its own line, and one
-- that turns out to be the wrong idea can be dropped without rewriting the
-- others.
--
-- Two day counts, because legacy needs both and they are not the same
-- question. Legacy: eight trading days, of which at least five made $50 or
-- more. EOD: five qualifying days, each making the size's own minimum, with no
-- separate total. So `payout_total_days` is null on EOD and that null means
-- "no separate total is required", not "unknown".
-- ---------------------------------------------------------------------------

alter table public.prop_presets add column if not exists funded_lock_at    numeric;
alter table public.prop_presets add column if not exists payout_total_days int;
alter table public.prop_presets add column if not exists payout_min_days   int;
alter table public.prop_presets add column if not exists payout_day_min    numeric;
alter table public.prop_presets add column if not exists payout_minimum    numeric;
alter table public.prop_presets add column if not exists max_payouts       int;
alter table public.prop_presets add column if not exists consistency_pct   numeric;
alter table public.prop_presets add column if not exists safety_net_payouts int;

comment on column public.prop_presets.funded_lock_at is
  'Where the trailing drawdown stops trailing ONCE FUNDED, above the starting '
  'balance. Confirmed for the legacy product, whose payout page states the '
  'trailing drawdown in a PA account stops at the starting balance plus $100 - '
  'so this is the drawdown plus 100, which puts the locked floor at +100. Null '
  'on EOD because nothing read says whether it locks. It is deliberately NOT '
  'the same field as prop_accounts.lock_at: an evaluation demonstrably does '
  'not lock, so this only ever fills a funded account.';

comment on column public.prop_presets.payout_total_days is
  'Trading days needed in total, whether or not they qualified. Legacy asks '
  'for eight. Null means no separate total is required, which is EOD, and is '
  'not the same as unknown.';

comment on column public.prop_presets.payout_min_days is
  'How many days must clear payout_day_min. Legacy five of eight, EOD five.';

comment on column public.prop_presets.consistency_pct is
  'The share of profit since the last approved payout that no single day may '
  'reach. Legacy 0.30 and it stops applying at the sixth payout; EOD 0.50 and '
  'nothing read says it ever stops. Stored as a fraction.';

comment on column public.prop_presets.safety_net_payouts is
  'How many payouts the safety net applies to. Legacy three, after which it no '
  'longer applies. Null means for the life of the account, which is EOD.';

comment on column public.prop_presets.max_payouts is
  'How many payouts this account may ever receive. EOD is capped at six and '
  'the account closes afterwards. Null means uncapped, which is legacy from '
  'the sixth payout onwards.';


-- ---------------------------------------------------------------------------
-- 3. Legacy - the intraday trailing product
--
-- Split 100% of the first $25,000 per account and 90% after that. Not stored:
-- it changes what a payout is worth and nothing on this site computes what a
-- payout is worth, because that is the firm's arithmetic on the firm's money.
-- ---------------------------------------------------------------------------

insert into public.prop_presets
  (firm, size, drawdown_type, profit_target, drawdown, lock_at, funded_lock_at,
   payout_total_days, payout_min_days, payout_day_min, payout_minimum,
   max_payouts, consistency_pct, safety_net_payouts) values
  ('Apex',  25000, 'trailing',  1500, 1500, null, 1600, 8, 5, 50, 500, null, 0.30, 3),
  ('Apex',  50000, 'trailing',  3000, 2500, null, 2600, 8, 5, 50, 500, null, 0.30, 3),
  ('Apex',  75000, 'trailing',  4250, 2750, null, 2850, 8, 5, 50, 500, null, 0.30, 3),
  ('Apex', 100000, 'trailing',  6000, 3000, null, 3100, 8, 5, 50, 500, null, 0.30, 3),
  ('Apex', 150000, 'trailing',  9000, 5000, null, 5100, 8, 5, 50, 500, null, 0.30, 3),
  ('Apex', 250000, 'trailing', 15000, 6500, null, 6600, 8, 5, 50, 500, null, 0.30, 3),
  ('Apex', 300000, 'trailing', 20000, 7500, null, 7600, 8, 5, 50, 500, null, 0.30, 3),
  -- Same size as the trailing $100k and five hundred dollars less drawdown,
  -- which is the whole reason this table needed re-keying.
  ('Apex', 100000, 'static',    6000, 2500, null, null, 8, 5, 50, 500, null, 0.30, 3)
on conflict (firm, size, drawdown_type) do update
  set profit_target      = excluded.profit_target,
      drawdown           = excluded.drawdown,
      lock_at            = excluded.lock_at,
      funded_lock_at     = excluded.funded_lock_at,
      payout_total_days  = excluded.payout_total_days,
      payout_min_days    = excluded.payout_min_days,
      payout_day_min     = excluded.payout_day_min,
      payout_minimum     = excluded.payout_minimum,
      max_payouts        = excluded.max_payouts,
      consistency_pct    = excluded.consistency_pct,
      safety_net_payouts = excluded.safety_net_payouts;


-- ---------------------------------------------------------------------------
-- 4. EOD - the end-of-day trailing product
--
-- `profit_target` is null on every row. The evaluation targets for this
-- product are not in anything that has been read, and inventing one would put
-- a bar on the card that the firm never set. Null reads as "not set yet" and
-- the page says so.
--
-- The safety net here holds for the LIFE of the account rather than the first
-- three payouts, and the account closes after six payouts. Both are stored
-- because both change what the page should say to somebody planning a
-- withdrawal.
-- ---------------------------------------------------------------------------

insert into public.prop_presets
  (firm, size, drawdown_type, profit_target, drawdown, lock_at, funded_lock_at,
   payout_total_days, payout_min_days, payout_day_min, payout_minimum,
   max_payouts, consistency_pct, safety_net_payouts) values
  ('Apex',  25000, 'eod', null, 1000, null, null, null, 5, 100, 500, 6, 0.50, null),
  ('Apex',  50000, 'eod', null, 2000, null, null, null, 5, 250, 500, 6, 0.50, null),
  ('Apex', 100000, 'eod', null, 3000, null, null, null, 5, 300, 500, 6, 0.50, null),
  ('Apex', 150000, 'eod', null, 4000, null, null, null, 5, 350, 500, 6, 0.50, null)
on conflict (firm, size, drawdown_type) do update
  set profit_target      = excluded.profit_target,
      drawdown           = excluded.drawdown,
      lock_at            = excluded.lock_at,
      funded_lock_at     = excluded.funded_lock_at,
      payout_total_days  = excluded.payout_total_days,
      payout_min_days    = excluded.payout_min_days,
      payout_day_min     = excluded.payout_day_min,
      payout_minimum     = excluded.payout_minimum,
      max_payouts        = excluded.max_payouts,
      consistency_pct    = excluded.consistency_pct,
      safety_net_payouts = excluded.safety_net_payouts;


-- ---------------------------------------------------------------------------
-- 5. What is deliberately NOT here
--
-- THE MAXIMUM PER REQUEST. Legacy caps it per size for the first five payouts
-- and lifts the cap afterwards; EOD varies it by BOTH size and payout number,
-- across a twenty-four cell table. That is a shape this table cannot hold and
-- it needs one of its own. Until it exists the page must not quote a maximum,
-- because quoting the wrong one would have somebody request a payout that gets
-- refused - annoying rather than dangerous, but still a number the page made
-- up.
--
-- THE SPLIT. Legacy pays 100% of the first $25,000 per account and 90% after;
-- EOD pays 100%. Nothing here computes what a payout is worth in the member's
-- pocket, and starting to would be this site doing the firm's arithmetic on
-- the firm's money.
--
-- NOTHING TOUCHES prop_accounts. No account is reclassified or refilled. A
-- member who bought an EOD account and configured it as trailing keeps exactly
-- what they typed, and the card tells them the two disagree.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 6. Checks worth running once
-- ---------------------------------------------------------------------------

-- a) Both ladders are there, and the same size appears under more than one
--    product with different drawdowns - which is the point of the re-key.
--
-- select size, drawdown_type, drawdown, profit_target
--   from public.prop_presets
--  where firm = 'Apex'
--  order by size, drawdown_type;

-- b) Every drawdown is exactly a hundred under the published safety net.
--
-- select size, drawdown_type, drawdown, drawdown + 100 as safety_net
--   from public.prop_presets
--  where firm = 'Apex'
--  order by size, drawdown_type;

-- c) The key really is three columns now.
--
-- select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--  where conrelid = 'public.prop_presets'::regclass and contype = 'p';
