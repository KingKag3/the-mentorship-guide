-- ===========================================================================
-- prop-presets-by-product.sql, in four pieces you can run one at a time
--
-- WHY THIS EXISTS
--
-- The Supabase SQL editor runs a whole script as ONE TRANSACTION. If any
-- statement fails, every statement before it is rolled back - so a file that
-- errors on its last line leaves the database exactly as it was, and running
-- it twice leaves it exactly as it was twice.
--
-- That is what happened here. `prop-presets-by-product.sql` was run, reported
-- an error somewhere, and left nothing behind - and the accounts page could
-- only say the presets table was empty, which was true and not the reason.
--
-- Each step below is independent and idempotent. Run them ONE AT A TIME and
-- stop at the first red message. Whichever step fails is the one to report,
-- and everything before it will have stuck.
--
-- When all four are green, `prop-presets-by-product.sql` is fully applied and
-- does not need running again.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- STEP 1 of 4 - the two columns on prop_presets
--
-- Run this on its own. Expect "Success. No rows returned."
-- ---------------------------------------------------------------------------

alter table public.prop_presets
  add column if not exists drawdown_type text not null default 'trailing';

alter table public.prop_presets
  add column if not exists product text;

update public.prop_presets
   set product = case
                   when drawdown_type = 'eod'    then 'eod'
                   when drawdown_type = 'static' then 'static'
                   else 'legacy'
                 end
 where product is null;

-- Check it landed before going on:
--   select firm, product, size, drawdown_type from public.prop_presets order by size;


-- ---------------------------------------------------------------------------
-- STEP 2 of 4 - the key, and the constraints
--
-- The likeliest step to fail, and the reason to run it alone. The primary key
-- cannot be created if two rows would share (firm, product, size). If it
-- complains about duplicates, this finds them:
--
--   select firm, product, size, count(*) from public.prop_presets
--    group by 1,2,3 having count(*) > 1;
-- ---------------------------------------------------------------------------

alter table public.prop_presets
  alter column product set not null;

alter table public.prop_presets
  drop constraint if exists prop_presets_drawdown_type_check;

alter table public.prop_presets
  add constraint prop_presets_drawdown_type_check
  check (drawdown_type in ('trailing', 'eod', 'static', 'daily'));

alter table public.prop_presets
  drop constraint if exists prop_presets_product_check;

alter table public.prop_presets
  add constraint prop_presets_product_check
  check (product in ('legacy', 'intraday', 'eod', 'static'));

alter table public.prop_presets drop constraint if exists prop_presets_pkey;
alter table public.prop_presets add primary key (firm, product, size);


-- ---------------------------------------------------------------------------
-- STEP 3 of 4 - the product column on the accounts, and the terms columns
--
-- This is the step the accounts page is waiting on. Once it is green, the
-- product control appears whether or not step 4 has been run.
-- ---------------------------------------------------------------------------

/* `profit_target` WAS NOT NULL, AND FOR TWO OF THE THREE PRODUCTS IT IS NOT
 * KNOWN.
 *
 * The column was declared `numeric not null` when the table held one product's
 * ladder and every row had a target. Apex does not publish an evaluation
 * target for the Intraday or EOD accounts in anything that has been read here,
 * and inventing one would put a bar on the card the firm never set - so those
 * rows carry null, and the insert was refused.
 *
 * Null now means "nobody has recorded a target for this", which the accounts
 * page already distinguishes from a target of zero. */
alter table public.prop_presets
  alter column profit_target drop not null;

comment on column public.prop_presets.profit_target is
  'What this product asks for at this size, where it is published. Null means '
  'nobody has recorded one - not that there is no target - and the page offers '
  'nothing rather than inventing a bar the firm never set.';

alter table public.prop_accounts
  add column if not exists product text;

alter table public.prop_accounts
  drop constraint if exists prop_accounts_product_check;

alter table public.prop_accounts
  add constraint prop_accounts_product_check
  check (product is null or product in ('legacy', 'intraday', 'eod', 'static'));

alter table public.prop_presets add column if not exists funded_lock_at     numeric;
alter table public.prop_presets add column if not exists payout_total_days  int;
alter table public.prop_presets add column if not exists payout_min_days    int;
alter table public.prop_presets add column if not exists payout_day_min     numeric;
alter table public.prop_presets add column if not exists payout_minimum     numeric;
alter table public.prop_presets add column if not exists max_payouts        int;
alter table public.prop_presets add column if not exists consistency_pct    numeric;
alter table public.prop_presets add column if not exists safety_net_payouts int;


-- ---------------------------------------------------------------------------
-- STEP 4 of 4 - the three ladders
--
-- Twenty rows. Every drawdown is derived from Apex's own published safety net,
-- which they define as the drawdown plus $100 - see prop-presets-by-product.sql
-- for where each figure comes from and which ones are confirmed.
-- ---------------------------------------------------------------------------

insert into public.prop_presets
  (firm, product, size, drawdown_type, profit_target, drawdown, lock_at,
   funded_lock_at, payout_total_days, payout_min_days, payout_day_min,
   payout_minimum, max_payouts, consistency_pct, safety_net_payouts) values
  ('Apex', 'legacy',    25000, 'trailing',  1500, 1500, null, 1600, 8, 5,  50, 500, null, 0.30, 3),
  ('Apex', 'legacy',    50000, 'trailing',  3000, 2500, null, 2600, 8, 5,  50, 500, null, 0.30, 3),
  ('Apex', 'legacy',    75000, 'trailing',  4250, 2750, null, 2850, 8, 5,  50, 500, null, 0.30, 3),
  ('Apex', 'legacy',   100000, 'trailing',  6000, 3000, null, 3100, 8, 5,  50, 500, null, 0.30, 3),
  ('Apex', 'legacy',   150000, 'trailing',  9000, 5000, null, 5100, 8, 5,  50, 500, null, 0.30, 3),
  ('Apex', 'legacy',   250000, 'trailing', 15000, 6500, null, 6600, 8, 5,  50, 500, null, 0.30, 3),
  ('Apex', 'legacy',   300000, 'trailing', 20000, 7500, null, 7600, 8, 5,  50, 500, null, 0.30, 3),
  ('Apex', 'static',   100000, 'static',    6000, 2500, null, null, 8, 5,  50, 500, null, 0.30, 3),
  ('Apex', 'intraday',  25000, 'trailing',  null, 1000, null, null, null, 5, 100, 500, 6, 0.50, null),
  ('Apex', 'intraday',  50000, 'trailing',  null, 2000, null, null, null, 5, 200, 500, 6, 0.50, null),
  ('Apex', 'intraday', 100000, 'trailing',  null, 3000, null, null, null, 5, 250, 500, 6, 0.50, null),
  ('Apex', 'intraday', 150000, 'trailing',  null, 4000, null, null, null, 5, 300, 500, 6, 0.50, null),
  ('Apex', 'eod',       25000, 'eod',       null, 1000, null, null, null, 5, 100, 500, 6, 0.50, null),
  ('Apex', 'eod',       50000, 'eod',       null, 2000, null, null, null, 5, 250, 500, 6, 0.50, null),
  ('Apex', 'eod',      100000, 'eod',       null, 3000, null, null, null, 5, 300, 500, 6, 0.50, null),
  ('Apex', 'eod',      150000, 'eod',       null, 4000, null, null, null, 5, 350, 500, 6, 0.50, null)
on conflict (firm, product, size) do update
  set drawdown_type = excluded.drawdown_type, profit_target = excluded.profit_target,
      drawdown = excluded.drawdown, lock_at = excluded.lock_at,
      funded_lock_at = excluded.funded_lock_at,
      payout_total_days = excluded.payout_total_days,
      payout_min_days = excluded.payout_min_days,
      payout_day_min = excluded.payout_day_min,
      payout_minimum = excluded.payout_minimum, max_payouts = excluded.max_payouts,
      consistency_pct = excluded.consistency_pct,
      safety_net_payouts = excluded.safety_net_payouts;


-- ---------------------------------------------------------------------------
-- When all four are green
--
-- select product, size, drawdown_type, drawdown, payout_day_min
--   from public.prop_presets where firm = 'Apex' order by size, product;
--
-- Sixteen rows. The same size appears under more than one product with a
-- different drawdown, which is the whole point of the re-key.
-- ---------------------------------------------------------------------------
