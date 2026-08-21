-- ===========================================================================
-- The drawdown belongs in the presets too
--
-- Run in the Supabase SQL editor after prop-accounts.sql and
-- funded-accounts.sql. Safe to re-run.
--
--
-- WHY THIS EXISTS
--
-- `prop_presets` already carried a profit target for every Apex size, and the
-- accounts page fills that in for you the moment you pick a size. The drawdown
-- was left to be typed.
--
-- So it was typed wrong. A $250,000 Apex account trails $6,500 and one was set
-- up as $6,000 - a figure nobody would question, sitting next to a target that
-- had been filled in correctly and automatically. It went unnoticed for weeks
-- and was only caught by comparing the site against a screenshot of the firm's
-- own account table:
--
--     Max Balance 258,491.80 - Liquidation Threshold 251,991.80 = 6,500.00
--
-- and the same on all nineteen accounts.
--
-- The consequence is small and points the wrong way. `Room left` on the
-- accounts page is the drawdown less the fall from the high-water mark, so a
-- drawdown $500 too small understates the room by $500. Conservative, which is
-- the safe direction - but a number that is wrong in a safe direction is still
-- a number that is wrong, and the next one might not be.
--
--
-- WHY THESE NUMBERS ARE A TABLE AND NOT A CONSTANT
--
-- The same reason funded-accounts.sql gives, which is worth repeating because
-- it applies harder here:
--
--     Prop firms change these terms, often, and without telling anybody who
--     wrote them down. A threshold baked into a migration is right until the
--     day it is silently wrong.
--
-- A row in a table can be corrected by anybody with the SQL editor open. A
-- number compiled into a page cannot. And nothing here overrides a member: the
-- preset fills an EMPTY field and never touches one that has been set.
--
--
-- HOW FAR TO TRUST THE SEED BELOW
--
-- Stated plainly, because a page that quotes a drawdown at somebody is making
-- a claim about their money.
--
--   * Apex $250,000 - drawdown 6,500 - VERIFIED on 18 August 2026 against a
--     live account table showing nineteen accounts of this size, every one of
--     them 6,500 between Max Balance and Liquidation Threshold.
--
--   * Every other size - the published ladder, and NOT independently verified.
--     They pair with the profit targets prop-accounts.sql already seeded, and
--     they carry exactly as much authority as those do, which is to say they
--     are a starting point and not a fact about your account.
--
-- The accounts page says which is which. A member whose own figure disagrees
-- with the preset is told that one of the two is out of date and that their
-- firm's dashboard settles it - not that they are wrong, because the preset
-- may be the stale one.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Two more columns, both nullable
--
-- Nullable rather than defaulted to zero. A size whose drawdown nobody has
-- filled in should read as "not known here", and the page distinguishes that
-- from a drawdown of nothing - which would mean an account that ends on the
-- first losing tick.
-- ---------------------------------------------------------------------------

alter table public.prop_presets
  add column if not exists drawdown numeric;

comment on column public.prop_presets.drawdown is
  'What this firm trails on this size, as a starting point for the form. Null '
  'means nobody has recorded it. Never overrides a figure the member set.';

alter table public.prop_presets
  add column if not exists lock_at numeric;

comment on column public.prop_presets.lock_at is
  'How far above the starting balance the trailing drawdown stops trailing. '
  'Apex locks at the allowance plus 100, which is why the locked floor sits '
  'just above where the account started rather than a full drawdown below its '
  'best day. Null means it never locks, or that nobody has recorded it.';


-- ---------------------------------------------------------------------------
-- 2. The Apex ladder
--
-- `lock_at` is drawdown + 100 throughout, which is Apex's rule rather than an
-- arithmetic coincidence - the threshold locks at the starting balance plus
-- $100 once the account has climbed a full allowance above where it began.
--
-- Written as an upsert on the primary key so re-running this file cannot
-- create duplicates, and so a corrected number here replaces the old one
-- rather than sitting beside it.
-- ---------------------------------------------------------------------------

insert into public.prop_presets (firm, size, profit_target, drawdown, lock_at) values
  ('Apex',  25000,  1500, 1500, 1600),
  ('Apex',  50000,  3000, 2500, 2600),
  ('Apex',  75000,  4250, 2750, 2850),
  ('Apex', 100000,  6000, 3000, 3100),
  ('Apex', 150000,  9000, 5000, 5100),
  ('Apex', 250000, 15000, 6500, 6600),   -- verified 18 Aug 2026, see above
  ('Apex', 300000, 20000, 7500, 7600)
on conflict (firm, size) do update
  set profit_target = excluded.profit_target,
      drawdown      = excluded.drawdown,
      lock_at       = excluded.lock_at;


-- ---------------------------------------------------------------------------
-- 3. What this does NOT do
--
-- It does not touch `prop_accounts`. Nothing here reaches into an account a
-- member has already set up, including the one with 6,000 in it - that is a
-- figure they entered, and a migration quietly rewriting somebody's risk
-- settings while they sleep is a worse idea than the wrong number it fixes.
--
-- The accounts page now shows the disagreement and offers to apply the preset
-- across whichever accounts it describes. Changing it stays a decision.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 4. Checks worth running once
-- ---------------------------------------------------------------------------

-- a) The ladder is there and paired.
--
-- select firm, size, profit_target, drawdown, lock_at
--   from public.prop_presets
--  where firm = 'Apex'
--  order by size;

-- b) lock_at is a hundred above the drawdown on every row, which is the rule.
--
-- select firm, size, drawdown, lock_at, lock_at - drawdown as gap
--   from public.prop_presets
--  where drawdown is not null
--  order by firm, size;

-- c) Nobody's account was touched. Whatever this returned before this file was
--    run, it returns now.
--
-- select account, size, profit_target, drawdown
--   from public.prop_accounts
--  order by account;
