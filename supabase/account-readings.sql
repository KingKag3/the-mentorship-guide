-- ===========================================================================
-- Readings off the firm's dashboard, kept
--
-- Run in the Supabase SQL editor after firm-reading.sql. Safe to re-run.
--
--
-- WHY THIS EXISTS: THE FIRM'S NUMBERS ARE PERISHABLE
--
-- `firm-reading.sql` put one reading on each account - balance, threshold, the
-- date it was read - and one reading is enough to say how much room is left
-- today. It is not enough for anything that needs two, and it quietly destroys
-- the old figures every time a new one is typed.
--
-- That mattered on 28 September 2026, when the passed evaluations went from the
-- Apex dashboard. `APEX-26922-1672` and its siblings cannot be looked at again:
-- the firm removes an account once it is finished, and with it every number it
-- ever showed. The account table copied into `prop-preset-drawdown.sql` on
-- 18 August - the one that proved an evaluation's drawdown trails the whole way
-- and does not lock at the allowance plus a hundred - is now the ONLY surviving
-- record of those accounts. Nobody set out to write a primary source; it became
-- one because the original went away.
--
-- A dashboard is not an archive. Anything not written down while the account is
-- alive is gone when it passes, fails, or is closed.
--
--
-- WHAT TWO READINGS CAN DO THAT ONE CANNOT
--
-- A trailing threshold follows the account's high-water mark until - on a
-- funded account, reportedly - it stops. Nothing on a single reading says
-- whether it has stopped. Two do:
--
--   * the balance made a new high between them and the threshold rose by the
--     same amount: still trailing.
--   * the balance made a new high and the threshold did not move: it has
--     locked, and it locked at the threshold in the later reading.
--
-- That answers the question without needing Max Balance from a page behind a
-- bot check, and it answers it from observation rather than from a published
-- rule - which is the distinction that cost this project a $1,891 overstatement
-- the first time round. See DECISIONS 2026-08-18 and 2026-09-28 (the lock).
--
-- `max_balance` is recorded where the member can see it, because it settles the
-- same question in one row instead of two. Null is the normal case.
--
--
-- ITS RELATIONSHIP TO `prop_accounts.firm_balance`
--
-- Those columns stay, and stay meaning "the latest reading". They are written
-- from here on every save, so every figure already computed from them carries
-- on working unchanged. This table is the history they are the head of - the
-- same shape as `prop_attempts` beside `prop_accounts.status`.
-- ===========================================================================

create table if not exists public.account_readings (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null default auth.uid()
                          references auth.users on delete cascade,

  -- The account name as the member types it, matching `prop_accounts.account`
  -- and `trades.account`. Not a foreign key: a reading may be taken on an
  -- account that has never been configured, and losing the reading because the
  -- card was not filled in first would defeat the point of the table.
  account     text        not null,

  -- The day the dashboard was READ, which is not the day the row was created.
  -- Every comparison on the accounts page is dated, and this is the date.
  seen_on     date        not null,

  balance     numeric,
  threshold   numeric,

  -- Shown on Apex's per-account summary rather than in the account table. It
  -- settles the lock on its own, so it is recorded where it is available.
  max_balance numeric,

  note        text,
  created_at  timestamptz not null default now(),

  -- One reading per account per day. A second reading on the same day replaces
  -- the first rather than sitting beside it: two readings hours apart are two
  -- states of the same day, and the later one is the one that survived it.
  unique (user_id, account, seen_on)
);

alter table public.account_readings enable row level security;

drop policy if exists "read own readings"   on public.account_readings;
drop policy if exists "write own readings"  on public.account_readings;
drop policy if exists "update own readings" on public.account_readings;
drop policy if exists "delete own readings" on public.account_readings;

create policy "read own readings"
  on public.account_readings for select
  using (user_id = auth.uid());

create policy "write own readings"
  on public.account_readings for insert
  with check (user_id = auth.uid());

create policy "update own readings"
  on public.account_readings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete own readings"
  on public.account_readings for delete
  using (user_id = auth.uid());

create index if not exists account_readings_account_idx
  on public.account_readings (user_id, account, seen_on);

comment on table public.account_readings is
  'What the firm''s own dashboard showed for an account on a given day. Typed '
  'in by the member; nothing here is fetched. Kept because a firm removes an '
  'account once it is finished and every number it ever showed goes with it.';


-- ---------------------------------------------------------------------------
-- 2. The readings already on the accounts, so nothing is lost by moving over
--
-- `firm-reading.sql` holds one per account. Anything with a date becomes the
-- first row of its own history. Undated readings are left where they are:
-- there is no honest day to file them under, and inventing one would put a
-- number into a table whose entire purpose is that its dates are real.
-- ---------------------------------------------------------------------------

insert into public.account_readings (user_id, account, seen_on, balance, threshold)
select user_id, account, firm_seen_on, firm_balance, firm_threshold
  from public.prop_accounts
 where firm_seen_on is not null
   and (firm_balance is not null or firm_threshold is not null)
on conflict (user_id, account, seen_on) do nothing;


-- ---------------------------------------------------------------------------
-- Check it landed. The first expects the table; the second, one row per
-- reading that had a date on it.
-- ---------------------------------------------------------------------------
-- select count(*) from public.account_readings;
--
-- select a.account, a.seen_on, a.balance, a.threshold
--   from public.account_readings a
--  order by a.account, a.seen_on;
