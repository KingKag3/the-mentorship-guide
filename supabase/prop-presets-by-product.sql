-- ===========================================================================
-- Which product, not just which size
--
-- Run in the Supabase SQL editor after prop-preset-drawdown.sql and
-- drawdown-eod.sql. Safe to re-run, and safe to run over the first version of
-- this file if that one already went in.
--
--
-- THIS FILE CHANGED ITS MIND, AND THE REASON IS WORTH KEEPING
--
-- The first version keyed the presets on (firm, size, drawdown_type) and
-- argued the case in a comment:
--
--     drawdown_type is the key rather than a new product column, because it
--     already is the distinction, and two columns that must agree are two
--     columns that will not.
--
-- That was wrong, and it was disproved within the hour by a third Apex page.
-- Apex sells THREE performance accounts - Legacy, Intraday and EOD - and
-- Legacy and Intraday BOTH trail intraday. The mechanism does not identify the
-- terms:
--
--     size        legacy    intraday       eod
--     $25,000      1,500       1,000     1,000
--     $50,000      2,500       2,000     2,000
--     $100,000     3,000       3,000     3,000
--     $150,000     5,000       4,000     4,000
--
-- Intraday and EOD share a drawdown ladder; Legacy does not. Two products with
-- identical mechanics and a drawdown $1,000 apart cannot be told apart by a
-- column describing the mechanics, and keying on one would have filled in the
-- Legacy figure for an Intraday account - a thousand dollars of room that does
-- not exist.
--
-- So there is a product column after all. The objection it was avoiding is
-- real and is handled below: `drawdown_type` is not typed independently, it
-- comes from the product's own preset row, so the two cannot drift.
--
--
-- WHERE THE NUMBERS COME FROM
--
-- Apex's three published payout tables, read on 18 August 2026. Every drawdown
-- is DERIVED rather than quoted, because the tables publish the safety net and
-- define it as the drawdown plus $100.
--
--   Legacy, from "Required Minimum Balance to Request a Payout": $25k 26,600 |
--   $50k 52,600 | $100k 103,100 | $150k 155,100 | $250k 256,600 |
--   $300k 307,600 | $100k static 102,600.
--
--   Intraday and EOD, from the Safety Net column of their own tables:
--   $25k 26,100 | $50k 52,100 | $100k 103,100 | $150k 154,100 - identical
--   between the two products.
--
-- This confirms all six Legacy trailing figures that were previously seeded
-- from the published ladder and marked unverified. They now agree with
-- arithmetic Apex wrote for a different purpose, which is a better check than
-- the ladder was.
--
-- $75,000 appears in none of the three tables and stays the one row on this
-- list standing on nothing but a number somebody wrote down.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The product, on the presets
--
-- Backfilled from whatever key the table currently has, so this runs correctly
-- whether the first version of this file went in or not:
--
--   * rows already marked 'eod' become the eod product
--   * rows already marked 'static' become static
--   * everything else is the Legacy ladder, which is what was seeded first
-- ---------------------------------------------------------------------------

/* `drawdown_type` FIRST, BECAUSE THE BACKFILL BELOW READS IT.
 *
 * The first draft of this file added this column and the rewrite dropped the
 * statement while keeping every reference to it. Nothing else in the project
 * creates it, so the update below failed with "column drawdown_type does not
 * exist", the script stopped there, and section 2 - the one that adds `product`
 * to prop_accounts - never ran. The accounts page then refused to load at all,
 * because it selects a column a half-applied migration never created.
 *
 * Idempotent, so this is safe whether the first draft went in or not. */
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

comment on column public.prop_presets.product is
  'Which set of terms, not how the drawdown moves. Apex Legacy and Intraday '
  'both trail intraday and have different drawdowns, so the mechanism cannot '
  'identify the terms and this column exists because assuming otherwise put '
  'the wrong ladder on the card.';

comment on column public.prop_presets.drawdown_type is
  'How the drawdown moves, for this product. Read from here rather than typed '
  'against the account, so the product and the mechanism cannot drift apart.';


-- ---------------------------------------------------------------------------
-- 2. The product, on the account
--
-- Nullable, and null means nobody has said. The page treats an unclassified
-- account as it always has - trailing mechanics, no terms looked up - which is
-- the pessimistic reading rather than the accurate one.
--
-- Nothing is backfilled. Guessing that nineteen accounts are Legacy because
-- their drawdown happens to match would be the page deciding what somebody
-- bought, and it is exactly the class of assumption this file is a correction
-- for.
-- ---------------------------------------------------------------------------

alter table public.prop_accounts
  add column if not exists product text;

alter table public.prop_accounts
  drop constraint if exists prop_accounts_product_check;

alter table public.prop_accounts
  add constraint prop_accounts_product_check
  check (product is null or product in ('legacy', 'intraday', 'eod', 'static'));

comment on column public.prop_accounts.product is
  'Which of the firm''s products this account is. Null means unclassified, and '
  'the page looks up no terms at all rather than the wrong ones.';


-- ---------------------------------------------------------------------------
-- 3. The payout terms, per product
--
-- Two day counts, because Legacy needs both and they are not the same
-- question. Legacy: eight trading days, of which at least five made $50 or
-- more. Intraday and EOD: five qualifying days, each making the size's own
-- minimum, with no separate total - so `payout_total_days` is null there, and
-- that null means "no separate total is required" rather than "unknown".
-- ---------------------------------------------------------------------------

alter table public.prop_presets add column if not exists funded_lock_at     numeric;
alter table public.prop_presets add column if not exists payout_total_days  int;
alter table public.prop_presets add column if not exists payout_min_days    int;
alter table public.prop_presets add column if not exists payout_day_min     numeric;
alter table public.prop_presets add column if not exists payout_minimum     numeric;
alter table public.prop_presets add column if not exists max_payouts        int;
alter table public.prop_presets add column if not exists consistency_pct    numeric;
alter table public.prop_presets add column if not exists safety_net_payouts int;

comment on column public.prop_presets.funded_lock_at is
  'Where the trailing drawdown stops trailing ONCE FUNDED, above the starting '
  'balance. Set for Legacy only, whose payout page states the trailing '
  'drawdown in a PA account stops at the starting balance plus $100 - so it is '
  'the drawdown plus 100. Null on Intraday and EOD because nothing read says '
  'whether they lock. Deliberately not the same field as prop_accounts.lock_at: '
  'an evaluation demonstrably does not lock, so this only fills a funded one.';

comment on column public.prop_presets.consistency_pct is
  'The share of profit since the last approved payout that no single day may '
  'reach. Legacy 0.30, and it stops applying at the sixth payout. Intraday and '
  'EOD 0.50, and nothing read says it ever stops.';

comment on column public.prop_presets.safety_net_payouts is
  'How many payouts the safety net applies to. Legacy three. Null means for '
  'the life of the account, which is Intraday and EOD.';

comment on column public.prop_presets.max_payouts is
  'How many payouts this account may ever receive. Intraday and EOD close the '
  'account after six. Null means uncapped, which is Legacy from the sixth on.';


-- ---------------------------------------------------------------------------
-- 4. Legacy - eight days, a 30% rule, and no cap on how many payouts
-- ---------------------------------------------------------------------------

insert into public.prop_presets
  (firm, product, size, drawdown_type, profit_target, drawdown, lock_at,
   funded_lock_at, payout_total_days, payout_min_days, payout_day_min,
   payout_minimum, max_payouts, consistency_pct, safety_net_payouts) values
  ('Apex', 'legacy',  25000, 'trailing',  1500, 1500, null, 1600, 8, 5, 50, 500, null, 0.30, 3),
  ('Apex', 'legacy',  50000, 'trailing',  3000, 2500, null, 2600, 8, 5, 50, 500, null, 0.30, 3),
  ('Apex', 'legacy',  75000, 'trailing',  4250, 2750, null, 2850, 8, 5, 50, 500, null, 0.30, 3),
  ('Apex', 'legacy', 100000, 'trailing',  6000, 3000, null, 3100, 8, 5, 50, 500, null, 0.30, 3),
  ('Apex', 'legacy', 150000, 'trailing',  9000, 5000, null, 5100, 8, 5, 50, 500, null, 0.30, 3),
  ('Apex', 'legacy', 250000, 'trailing', 15000, 6500, null, 6600, 8, 5, 50, 500, null, 0.30, 3),
  ('Apex', 'legacy', 300000, 'trailing', 20000, 7500, null, 7600, 8, 5, 50, 500, null, 0.30, 3),
  ('Apex', 'static', 100000, 'static',    6000, 2500, null, null, 8, 5, 50, 500, null, 0.30, 3)
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
-- 5. Intraday and EOD - five qualifying days, a 50% rule, six payouts and the
--    account closes
--
-- Same mechanism for Intraday as Legacy and the same drawdown ladder as EOD,
-- which is precisely why neither of those columns could have keyed this table.
--
-- `profit_target` is null throughout. The evaluation targets for these
-- products are in nothing that has been read, and inventing one would put a
-- bar on the card the firm never set.
--
-- The two differ only in the minimum a day must make, and EOD asks for more at
-- every size above $25,000.
-- ---------------------------------------------------------------------------

insert into public.prop_presets
  (firm, product, size, drawdown_type, profit_target, drawdown, lock_at,
   funded_lock_at, payout_total_days, payout_min_days, payout_day_min,
   payout_minimum, max_payouts, consistency_pct, safety_net_payouts) values
  ('Apex', 'intraday',  25000, 'trailing', null, 1000, null, null, null, 5, 100, 500, 6, 0.50, null),
  ('Apex', 'intraday',  50000, 'trailing', null, 2000, null, null, null, 5, 200, 500, 6, 0.50, null),
  ('Apex', 'intraday', 100000, 'trailing', null, 3000, null, null, null, 5, 250, 500, 6, 0.50, null),
  ('Apex', 'intraday', 150000, 'trailing', null, 4000, null, null, null, 5, 300, 500, 6, 0.50, null),

  ('Apex', 'eod',  25000, 'eod', null, 1000, null, null, null, 5, 100, 500, 6, 0.50, null),
  ('Apex', 'eod',  50000, 'eod', null, 2000, null, null, null, 5, 250, 500, 6, 0.50, null),
  ('Apex', 'eod', 100000, 'eod', null, 3000, null, null, null, 5, 300, 500, 6, 0.50, null),
  ('Apex', 'eod', 150000, 'eod', null, 4000, null, null, null, 5, 350, 500, 6, 0.50, null)
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
-- 6. Rows the first version of this file may have left behind
--
-- It seeded on (firm, size, drawdown_type) with no product column, and the
-- backfill above turned those into legacy, static and eod - which is where
-- they belong. Nothing is deleted, because deleting reference data on a guess
-- is how a ladder goes missing. This is here so anybody checking knows to
-- expect exactly the rows seeded above and no others.
--
-- select firm, product, size, drawdown_type, drawdown
--   from public.prop_presets order by firm, product, size;
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 7. What is deliberately NOT here
--
-- THE MAXIMUM PER REQUEST. Legacy caps it per size for five payouts and lifts
-- it afterwards; Intraday and EOD vary it by size AND payout number, and their
-- two tables are not the same as each other. That is twenty-four cells apiece
-- and it needs a table of its own. Until it exists the page quotes no maximum,
-- because the wrong one would have somebody request a payout that gets
-- refused.
--
-- THE SPLIT. Legacy pays 100% of the first $25,000 per account and 90% after;
-- Intraday and EOD pay 100%. Nothing here computes what a payout is worth in
-- the member's pocket, and starting to would be this site doing the firm's
-- arithmetic on the firm's money.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 8. Checks worth running once
-- ---------------------------------------------------------------------------

-- a) All four products, and the same size under more than one of them with
--    different drawdowns - which is the point.
--
-- select product, size, drawdown_type, drawdown, payout_day_min
--   from public.prop_presets
--  where firm = 'Apex' order by size, product;

-- b) Legacy and Intraday share a mechanism and not a ladder.
--
-- select size,
--        max(drawdown) filter (where product = 'legacy')   as legacy,
--        max(drawdown) filter (where product = 'intraday') as intraday
--   from public.prop_presets
--  where firm = 'Apex' and drawdown_type = 'trailing'
--  group by size order by size;

-- c) The key is three columns, and product is one of them.
--
-- select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--  where conrelid = 'public.prop_presets'::regclass and contype = 'p';
