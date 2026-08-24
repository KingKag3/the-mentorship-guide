-- ===========================================================================
-- Money that moves without a trade
--
-- Run in the Supabase SQL editor after funded-accounts.sql. Safe to re-run.
--
--
-- WHY THIS EXISTS
--
-- Every figure on the accounts page is computed from `trades`. A payout is not
-- a trade, so until now the site could not see the money leave.
--
-- That is not a cosmetic gap. `Room left` is the drawdown less the fall from
-- the high-water mark, and both halves came from trading results - so a
-- $5,000 withdrawal moved the firm's balance $5,000 closer to the floor while
-- the page carried on reporting the room as though it were still there. The
-- one error on that page that ends an account is room that does not exist, and
-- a payout created exactly that, silently, on the accounts where the stakes
-- are highest.
--
-- The payout threshold broke the same way. It tested what the member had
-- EARNED rather than what the account HELD, so somebody who withdrew down to
-- the threshold would still be told they were above it.
--
--
-- THE DISTINCTION THIS TABLE FORCES
--
-- One number was doing two jobs, and a withdrawal is the first event that
-- pulls them apart:
--
--   * WHAT YOUR TRADING EARNED. The sum of your results. It feeds the profit
--     target, the statistics, the win rate, every behavioural finding. A
--     payout must NEVER touch it - a withdrawal recorded as a loss would show
--     up as a bad day and corrupt the analysis of days that were fine.
--
--   * WHAT THE ACCOUNT HOLDS. Earned, less anything taken out. It feeds the
--     drawdown, the room left and the payout threshold, because those are
--     questions about a balance rather than about trading.
--
-- They are the same number until the first withdrawal, which is why nothing
-- noticed.
--
--
-- WHY IT IS ADJUSTMENTS AND NOT PAYOUTS
--
-- A payout is the case that forced this, and it is not the only thing a firm
-- does to a balance without a trade being involved: reset fees, credits,
-- corrections, promotional adjustments. A `payouts` table would have needed a
-- sibling within the month, and two tables answering "what happened to this
-- balance" is how they come to disagree.
--
-- So the amount is SIGNED - a payout is negative, a credit positive - and the
-- kind is a label rather than a rule. Nothing here computes differently based
-- on the kind; it exists so the member can read their own history back.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The table
--
-- `account` is text and NOT a foreign key, the same reasoning prop-accounts.sql
-- gives for `account` itself: the account row may be deleted or may never have
-- been configured, and losing the record of a withdrawal is worse than a
-- dangling name.
-- ---------------------------------------------------------------------------

create table if not exists public.account_adjustments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  account     text not null,
  happened_on date not null,
  amount      numeric not null,
  kind        text not null default 'payout',
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.account_adjustments
  drop constraint if exists account_adjustments_kind_check;

alter table public.account_adjustments
  add constraint account_adjustments_kind_check
  check (kind in ('payout', 'fee', 'credit'));

-- A zero moves nothing and is almost always a half-finished entry.
alter table public.account_adjustments
  drop constraint if exists account_adjustments_amount_check;

alter table public.account_adjustments
  add constraint account_adjustments_amount_check
  check (amount <> 0);

comment on table public.account_adjustments is
  'Money moving in or out of a prop account without a trade behind it. '
  'Signed: a payout is negative. Never counted as trading profit or loss.';

comment on column public.account_adjustments.amount is
  'Signed. Negative for anything leaving the account - a payout or a fee - and '
  'positive for a credit. The sign is what the arithmetic uses; `kind` is a '
  'label for the member, not a rule.';

create index if not exists account_adjustments_user_account
  on public.account_adjustments (user_id, account, happened_on);


-- ---------------------------------------------------------------------------
-- 2. Row-level security
--
-- Four policies rather than one `for all`, so each can be read on its own and
-- so a mistake in one cannot quietly widen the others. Every one of them is
-- owner-only: an adjustment is a record of somebody's money leaving their
-- account and there is no case for anybody else reading it, mentor included.
-- ---------------------------------------------------------------------------

alter table public.account_adjustments enable row level security;

drop policy if exists "own adjustments readable" on public.account_adjustments;
create policy "own adjustments readable"
  on public.account_adjustments for select
  using (auth.uid() = user_id);

drop policy if exists "own adjustments insertable" on public.account_adjustments;
create policy "own adjustments insertable"
  on public.account_adjustments for insert
  with check (auth.uid() = user_id);

drop policy if exists "own adjustments updatable" on public.account_adjustments;
create policy "own adjustments updatable"
  on public.account_adjustments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own adjustments deletable" on public.account_adjustments;
create policy "own adjustments deletable"
  on public.account_adjustments for delete
  using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 3. Does a payout lower the high-water mark?
--
-- THE ONE QUESTION THAT DECIDES WHETHER A PAYOUT IS FREE OR EXPENSIVE, AND
-- NOBODY HERE CAN ANSWER IT.
--
-- If the firm lowers your maximum balance by what you withdrew, the threshold
-- comes down with you and the payout costs nothing in room. If it does not,
-- the payout comes off your room one for one - so a member could take a
-- withdrawal and go from comfortable to nearly dead without placing a trade.
--
-- That is the difference between safe and finished, and this project has never
-- had a funded account to look at. The last time a published rule was seeded
-- here on trust - the drawdown lock - the member's own account table
-- contradicted it within a day.
--
-- So it is a nullable boolean the member sets, and null means unanswered.
-- Unanswered is treated as FALSE, which is the conservative reading: assume
-- the mark stays where it is and the payout costs you the full amount. Being
-- wrong that way understates your room. Being wrong the other way invents it.
-- ---------------------------------------------------------------------------

alter table public.prop_accounts
  add column if not exists payout_lowers_mark boolean;

comment on column public.prop_accounts.payout_lowers_mark is
  'Does a withdrawal reduce the firm''s high-water mark too? Null means nobody '
  'has checked, and is treated as false - the conservative reading, in which a '
  'payout costs you its full value in room. True means the mark falls with the '
  'withdrawal and the payout costs nothing.';


-- ---------------------------------------------------------------------------
-- 4. Checks worth running once
-- ---------------------------------------------------------------------------

-- a) The table exists behind a policy that holds. Signed out with the
--    publishable key this must answer 200 [] - a table that does not exist
--    answers 404 PGRST205 and names itself.
--
-- select count(*) from public.account_adjustments;

-- b) The four policies are there and every one of them is owner-scoped.
--
-- select polname, pg_get_expr(polqual, polrelid) as using_expr
--   from pg_policy
--  where polrelid = 'public.account_adjustments'::regclass
--  order by polname;

-- c) Zero is refused, and so is an unknown kind.
--
-- insert into public.account_adjustments (user_id, account, happened_on, amount)
--   values (auth.uid(), 'test', current_date, 0);          -- expect a violation

-- d) The new column is there and nullable.
--
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'prop_accounts'
--    and column_name = 'payout_lowers_mark';
