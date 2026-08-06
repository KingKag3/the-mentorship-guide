-- ===========================================================================
-- Scale-outs, and what the trade actually paid
--
-- Run in the Supabase SQL editor after trades.sql. Safe to re-run.
--
-- A trade with one exit price cannot say how the money was made. Two
-- contracts off at the first target and a runner to the second is a different
-- trade from four at one price, and it is the difference most worth reviewing.
--
-- Each partial is a row here. The weighted average of them is written back to
-- trades.exit_price, so points, R, the statistics page and the calendar keep
-- working off the columns they already read:
--
--     sum((price_i - entry) * size_i)  ==  (weighted_avg - entry) * sum(size_i)
--
-- which is why the aggregate stays exact rather than approximate.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Fees
--
-- Commission is the one part of the result that cannot be derived from the
-- prices, so it is the one part that has to be typed.
-- ---------------------------------------------------------------------------

alter table public.trades
  add column if not exists fees numeric;

comment on column public.trades.fees is
  'Total commission and exchange fees for the trade, in account currency. '
  'Subtracted from the derived dollar result. Null means not recorded.';


-- ---------------------------------------------------------------------------
-- 2. The partials
-- ---------------------------------------------------------------------------

create table if not exists public.trade_exits (
  id          bigint generated always as identity primary key,
  trade_id    bigint  not null references public.trades(id) on delete cascade,
  contracts   numeric not null,
  price       numeric not null,
  note        text,
  sort_order  int     not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists trade_exits_trade_idx
  on public.trade_exits (trade_id, sort_order);


-- ---------------------------------------------------------------------------
-- 3. Row-level security
--
-- Ownership is inherited from the parent trade rather than duplicated onto
-- this table. A user_id column here could disagree with the trade's, and the
-- one that mattered would be whichever the policy happened to check.
-- ---------------------------------------------------------------------------

alter table public.trade_exits enable row level security;

drop policy if exists "read own exits"    on public.trade_exits;
drop policy if exists "insert own exits"  on public.trade_exits;
drop policy if exists "update own exits"  on public.trade_exits;
drop policy if exists "delete own exits"  on public.trade_exits;
drop policy if exists "admins read shared exits" on public.trade_exits;

create policy "read own exits"
  on public.trade_exits for select
  using (exists (
    select 1 from public.trades t
    where t.id = trade_exits.trade_id and t.user_id = auth.uid()
  ));

create policy "insert own exits"
  on public.trade_exits for insert
  with check (exists (
    select 1 from public.trades t
    where t.id = trade_exits.trade_id and t.user_id = auth.uid()
  ));

create policy "update own exits"
  on public.trade_exits for update
  using (exists (
    select 1 from public.trades t
    where t.id = trade_exits.trade_id and t.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.trades t
    where t.id = trade_exits.trade_id and t.user_id = auth.uid()
  ));

create policy "delete own exits"
  on public.trade_exits for delete
  using (exists (
    select 1 from public.trades t
    where t.id = trade_exits.trade_id and t.user_id = auth.uid()
  ));

-- Same opt-in as the parent: a mentor sees the partials only on a trade its
-- owner explicitly shared.
create policy "admins read shared exits"
  on public.trade_exits for select
  using (exists (
    select 1 from public.trades t
    where t.id = trade_exits.trade_id
      and t.shared_with_mentor
      and public.is_admin()
  ));
