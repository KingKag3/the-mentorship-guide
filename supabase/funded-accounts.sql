-- ===========================================================================
-- Funded accounts: what a passed evaluation turns into
--
-- Run in the Supabase SQL editor after account-kind.sql. Safe to re-run.
--
-- WHAT WAS MISSING
--
-- Passing an evaluation gets you a different account, with a different number
-- and different rules. Until now the site had nowhere to put either fact:
--
--   * `kind` was prop, live or demo, so a funded account was filed as `prop` -
--     which means the page expects a PROFIT TARGET. A funded account does not
--     have one. Every funded account therefore read as half configured, for
--     ever, and no amount of filling the form in would fix it.
--
--   * Nothing recorded that one account came from another. Two rows, no link,
--     and the only place the connection existed was in somebody's head.
--
--
-- WHY THE NUMBERS ARE FIELDS AND NOT CONSTANTS
--
-- Every payout rule below is a column the member fills in, seeded from
-- `prop_presets` where a firm's terms are known. None of it is hardcoded, and
-- that is deliberate rather than lazy.
--
-- Prop firms change these terms, often, and without telling anybody who wrote
-- them down. A threshold baked into a migration is right until the day it is
-- silently wrong - and the failure mode is the worst kind: a member reads
-- "eligible for a payout" off a page that is quoting last year's rules at
-- them. `prop-accounts.sql` already says this about the profit target:
--
--     What the firm set. Nothing here is guessed on the member's behalf.
--
-- The same rule applies here, and applies harder, because a payout is money
-- somebody is going to go and ask for.
--
--
-- WHAT THE SITE COMPUTES, AND WHAT IT REFUSES TO
--
-- It computes progress from the journal: how far above the starting balance
-- the account is, how many days have been traded, how many of those cleared
-- the daily minimum. Those are arithmetic over the member's own rows.
--
-- It does not decide whether a payout will be granted. That is the firm's
-- call, against terms this site does not hold and cannot verify, and the same
-- caveat the drawdown carries applies: the journal holds closed trades, so any
-- balance figure here is a floor.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. `funded` becomes a kind of its own
--
-- Dropped and recreated rather than altered, the same shape account-kind.sql
-- used, so re-running this file is safe.
-- ---------------------------------------------------------------------------

alter table public.prop_accounts
  drop constraint if exists prop_accounts_kind_check;

alter table public.prop_accounts
  add constraint prop_accounts_kind_check
  check (kind in ('prop', 'funded', 'live', 'demo'));

comment on column public.prop_accounts.kind is
  'prop: an evaluation, with a target to reach. funded: what passing one turns '
  'into - no target, a payout threshold instead. live: your own money. demo: '
  'practice, kept out of every real total.';


-- ---------------------------------------------------------------------------
-- 2. Where a funded account came from
--
-- Text, matching `account`, and NOT a foreign key - the same reasoning
-- prop-accounts.sql gives for `account` itself. The evaluation may be deleted,
-- may never have been configured, or may have been imported under a name that
-- no longer exists. A key would refuse the link in exactly the cases where the
-- history is most worth keeping.
--
-- Nullable, because a funded account can arrive without this site having seen
-- the evaluation that produced it - somebody who joins mid-way has funded
-- accounts and no record of passing.
-- ---------------------------------------------------------------------------

alter table public.prop_accounts
  add column if not exists from_account text;

comment on column public.prop_accounts.from_account is
  'The evaluation this funded account came from, by name. Not a foreign key: '
  'the evaluation may be gone, and losing the link is worse than a dangling '
  'name.';


-- ---------------------------------------------------------------------------
-- 3. The payout terms, all of them the firm's numbers
--
-- Deliberately four separate columns rather than one JSON blob. Each is a
-- number with a name, each is shown and edited on its own line, and a column
-- that turns out to be the wrong idea can be dropped without rewriting the
-- others.
-- ---------------------------------------------------------------------------

alter table public.prop_accounts
  add column if not exists payout_threshold numeric;

comment on column public.prop_accounts.payout_threshold is
  'How far ABOVE the starting balance the account must sit before a payout can '
  'be requested - the safety net, in the firm''s words. Not the payout amount.';

alter table public.prop_accounts
  add column if not exists payout_min_days int;

comment on column public.prop_accounts.payout_min_days is
  'How many qualifying trading days are needed before a payout can be '
  'requested.';

alter table public.prop_accounts
  add column if not exists payout_day_min numeric;

comment on column public.prop_accounts.payout_day_min is
  'What a single day has to make to count towards payout_min_days. Null means '
  'every day traded counts, which is what some firms do - it is not the same '
  'as zero, and the page says so.';

alter table public.prop_accounts
  add column if not exists lock_at numeric;

comment on column public.prop_accounts.lock_at is
  'How far above the starting balance the trailing drawdown stops trailing and '
  'becomes static. Null means it never locks. This is the number that decides '
  'whether an account is still one bad trade from over.';


-- ---------------------------------------------------------------------------
-- 4. What existing data does
--
-- Nothing changes. Every existing row keeps kind = 'prop' and gets four nulls,
-- which read as "not set" rather than as zero - the page distinguishes the two,
-- for the reason account-kind.sql gives about empty states saying which kind of
-- empty they are.
--
-- Marking an account funded is a decision only the member can make, because
-- only they know whether the firm has actually funded it. Nothing here guesses.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 5. Checks worth running once
-- ---------------------------------------------------------------------------

-- a) The constraint takes the new value, and still refuses nonsense.
--
-- select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--  where conrelid = 'public.prop_accounts'::regclass
--    and conname = 'prop_accounts_kind_check';

-- b) The four columns are there and are nullable.
--
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'prop_accounts'
--    and column_name in ('from_account', 'payout_threshold', 'payout_min_days',
--                        'payout_day_min', 'lock_at')
--  order by column_name;

-- c) Nothing was reclassified behind anybody's back.
--
-- select kind, count(*) from public.prop_accounts group by kind order by kind;
