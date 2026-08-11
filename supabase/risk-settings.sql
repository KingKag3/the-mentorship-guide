-- ---------------------------------------------------------------------------
-- What one R costs, per account
--
-- Run this in the Supabase SQL editor. Idempotent, safe to re-run.
--
-- R is points divided by risk, and risk is the distance from entry to stop. A
-- broker export does not carry a stop - Tradovate's Performance file has entry,
-- exit, size and result and nothing else - so an imported trade has no R, and
-- the statistics page can only measure it in dollars.
--
-- This is the honest way round that: the member STATES what they risk per trade
-- and R is worked out from the stated figure. It is a declaration, not a
-- derivation, and the interface has to keep saying so. For a prop account it is
-- usually true by policy anyway - the plan says $200 a trade and that is that.
--
-- WHAT THIS DELIBERATELY IS NOT
--
-- The tempting alternative is to infer 1R from the member's own average loss.
-- It is circular. Define 1R as the median loss and the average loss becomes
-- -1.00R by construction, for every member, forever - a number that looks like
-- a result and carries no information. A real stop or a stated risk are the
-- only two honest sources, and only one of them is in the data.
--
-- Per account rather than per member, because seventeen copied prop accounts do
-- not all risk the same amount, and the one that diverged is the whole reason
-- the copies are imported separately.
-- ---------------------------------------------------------------------------

create table if not exists public.risk_settings (
  user_id        uuid        not null references auth.users on delete cascade,
  account        text        not null,
  risk_per_trade numeric     not null check (risk_per_trade > 0),
  updated_at     timestamptz not null default now(),
  primary key (user_id, account)
);

comment on table public.risk_settings is
  'Member-stated risk per trade, per account. Used to derive R when a trade has no stop.';
comment on column public.risk_settings.risk_per_trade is
  'Currency amount the member says one R costs them. Declared, not measured.';

alter table public.risk_settings enable row level security;

drop policy if exists "read own risk"   on public.risk_settings;
drop policy if exists "write own risk"  on public.risk_settings;
drop policy if exists "update own risk" on public.risk_settings;
drop policy if exists "delete own risk" on public.risk_settings;

create policy "read own risk"
  on public.risk_settings for select
  using (user_id = auth.uid());

create policy "write own risk"
  on public.risk_settings for insert
  with check (user_id = auth.uid() and public.is_member());

create policy "update own risk"
  on public.risk_settings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete own risk"
  on public.risk_settings for delete
  using (user_id = auth.uid());

-- Set on write rather than trusted from the client, same as everywhere else.
create or replace function public.risk_settings_stamp()
returns trigger
language plpgsql
as $$
begin
  new.user_id := coalesce(new.user_id, auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists risk_settings_stamped on public.risk_settings;

create trigger risk_settings_stamped
  before insert or update on public.risk_settings
  for each row execute function public.risk_settings_stamp();


-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
--
--   select account, risk_per_trade, updated_at
--     from public.risk_settings
--    order by account;
--
-- Nothing here until the statistics page writes a row, which is expected.
-- ---------------------------------------------------------------------------
