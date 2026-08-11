-- ===========================================================================
-- Prop accounts: what each one has to reach, and what kills it
--
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- A funded account is not judged on whether it made money. It is judged on two
-- thresholds set by somebody else - a profit target that passes it and a
-- drawdown that ends it - and the journal already holds every trade needed to
-- say where an account sits between them. What it does not hold is the two
-- numbers, because they belong to the firm rather than to the trade.
--
-- WHY THIS IS NOT A COLUMN ON trades
--
-- The target belongs to the account, not to any trade in it, and the same
-- account keeps its target across hundreds of rows. Putting it on the trade
-- would restate it every time and let two rows in one account disagree about
-- what passing means.
--
-- `account` is text and matches trades.account rather than pointing at a key.
-- That is deliberate: the importer writes whatever the broker file says, and a
-- foreign key would refuse an import from an account nobody had set up first -
-- which is exactly backwards, since the import is how you find out the account
-- exists.
-- ===========================================================================


create table if not exists public.prop_accounts (
  id             bigint generated always as identity primary key,
  user_id        uuid        not null default auth.uid()
                             references auth.users on delete cascade,

  account        text        not null,
  firm           text,

  -- What the firm set. Nothing here is guessed on the member's behalf.
  size           numeric,
  profit_target  numeric,
  drawdown       numeric,
  drawdown_type  text        default 'trailing'
                             check (drawdown_type in ('trailing', 'static', 'daily')),
  min_days       int,

  -- Where it stands. 'active' until the member says otherwise: passing is a
  -- statement the firm makes, not one this page is entitled to make for them.
  status         text        not null default 'active'
                             check (status in ('active', 'passed', 'failed', 'retired')),
  started_on     date,
  settled_on     date,
  notes          text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (user_id, account)
);

alter table public.prop_accounts enable row level security;

drop policy if exists "read own props"   on public.prop_accounts;
drop policy if exists "write own props"  on public.prop_accounts;
drop policy if exists "update own props" on public.prop_accounts;
drop policy if exists "delete own props" on public.prop_accounts;

create policy "read own props"
  on public.prop_accounts for select
  using (user_id = auth.uid());

create policy "write own props"
  on public.prop_accounts for insert
  with check (user_id = auth.uid());

create policy "update own props"
  on public.prop_accounts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete own props"
  on public.prop_accounts for delete
  using (user_id = auth.uid());

create index if not exists prop_accounts_user_idx
  on public.prop_accounts (user_id, account);


-- ---------------------------------------------------------------------------
-- The Apex ladder, as reference rather than as truth
--
-- Supplied by Kag3 on 11 August 2026 and stored so it stops living in a chat
-- log. It is a lookup the form offers as a default when you pick a size - it
-- does not write itself onto any account, and an account's own target is
-- whatever is stored on its row.
--
-- **Drawdown is deliberately absent.** The profit targets came from somebody
-- who has the accounts; the drawdown figures did not, and a drawdown that is
-- wrong by a few hundred dollars tells a member their account is alive when it
-- is dead. That number gets typed in per account, from the firm's own page.
-- ---------------------------------------------------------------------------

create table if not exists public.prop_presets (
  firm          text    not null,
  size          numeric not null,
  profit_target numeric not null,
  primary key (firm, size)
);

alter table public.prop_presets enable row level security;

drop policy if exists "anyone signed in reads presets" on public.prop_presets;

-- Reference data, the same for everybody, and not worth a per-user copy.
create policy "anyone signed in reads presets"
  on public.prop_presets for select
  using (auth.uid() is not null);

insert into public.prop_presets (firm, size, profit_target) values
  ('Apex',  25000,  1500),
  ('Apex',  50000,  3000),
  ('Apex',  75000,  4250),
  ('Apex', 100000,  6000),
  ('Apex', 150000,  9000),
  ('Apex', 250000, 15000),
  ('Apex', 300000, 20000)
on conflict (firm, size) do update
  set profit_target = excluded.profit_target;


-- ---------------------------------------------------------------------------
-- Keep updated_at honest
-- ---------------------------------------------------------------------------

create or replace function public.touch_prop_account()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists prop_accounts_touch on public.prop_accounts;

create trigger prop_accounts_touch
  before update on public.prop_accounts
  for each row execute function public.touch_prop_account();
