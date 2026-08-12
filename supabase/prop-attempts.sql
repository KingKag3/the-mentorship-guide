-- ===========================================================================
-- Attempts: one account, several lives
--
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- A prop account does not end when it fails. It gets reset, the balance goes
-- back to the start, the trailing floor goes back to the start, and the same
-- account number carries on with a new life. Apex will do that as many times
-- as you are willing to pay for.
--
-- `prop_accounts` has `unique (user_id, account)` - one row per account name -
-- so the only way to make the numbers right after a reset was to move
-- `started_on` forward and set the status back to active. That works, and it
-- overwrites the record of the attempt that just died: when it began, how it
-- ended, that it existed at all.
--
-- Which is the wrong thing to lose. THE BLOWN ATTEMPT IS THE MOST INSTRUCTIVE
-- RECORD A MEMBER OWNS. "What did the week I blew it look like" is the most
-- valuable question in this journal, and it is unanswerable if the answer is
-- thrown away to keep a progress bar honest.
--
-- WHAT BELONGS WHERE
--
--   prop_accounts   the stable facts. Firm, size, kind, which sort of drawdown,
--                   minimum days. These survive a reset because they are
--                   properties of the product, not of the attempt.
--
--   prop_attempts   one life. Started, ended, how it ended, and optionally its
--                   own target and floor - firms change terms between resets
--                   and an old attempt should keep the terms it was judged on.
--
-- A trade belongs to an attempt by DATE. Nothing needs re-tagging, the importer
-- is untouched, and an import that arrives before an attempt is recorded still
-- lands correctly the moment one is.
--
-- WHAT THIS DOES NOT DO
--
-- Detect a breach. The journal holds closed trades; a trailing floor on Apex
-- follows unrealised equity, so a trade that went +$800 in your favour before
-- closing flat moved the floor permanently and nothing here saw it. Ending an
-- attempt stays something the member states, for the same reason passing does.
-- The page can confirm you are dead. It can never tell you that you are safe.
-- ===========================================================================


create table if not exists public.prop_attempts (
  id             bigint generated always as identity primary key,
  user_id        uuid        not null default auth.uid()
                             references auth.users on delete cascade,

  -- Text, matching trades.account and prop_accounts.account. Not a foreign key,
  -- for the reason prop-accounts.sql gives: the importer writes whatever the
  -- broker file says, and a key would refuse an import from an account nobody
  -- had set up first - which is backwards, since importing is how you find out
  -- the account exists.
  account        text        not null,
  attempt        int         not null check (attempt >= 1),

  started_on     date        not null,
  ended_on       date,

  outcome        text        not null default 'active'
                             check (outcome in ('active', 'passed', 'failed', 'retired')),

  -- Null means "whatever the account says". An attempt only carries its own
  -- figures when the firm changed them, and then the old attempt keeps the
  -- terms it was actually judged against.
  profit_target  numeric,
  drawdown       numeric,

  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (user_id, account, attempt),

  -- An attempt that has ended must say when, and one still running must not.
  -- Half a resolution is worse than none: it puts a progress bar on an account
  -- nobody is trading and hides one somebody is.
  constraint prop_attempts_settled check (
    (outcome = 'active' and ended_on is null) or
    (outcome <> 'active' and ended_on is not null)
  ),
  constraint prop_attempts_order check (ended_on is null or ended_on >= started_on)
);

-- One life at a time. Two active attempts on one account would split every
-- trade after the second start between them, and the page would quietly show
-- half the progress.
create unique index if not exists prop_attempts_one_active
  on public.prop_attempts (user_id, account)
  where outcome = 'active';

create index if not exists prop_attempts_lookup
  on public.prop_attempts (user_id, account, started_on);

alter table public.prop_attempts enable row level security;

drop policy if exists "read own attempts"   on public.prop_attempts;
drop policy if exists "write own attempts"  on public.prop_attempts;
drop policy if exists "update own attempts" on public.prop_attempts;
drop policy if exists "delete own attempts" on public.prop_attempts;

create policy "read own attempts"
  on public.prop_attempts for select
  using (user_id = auth.uid());

create policy "write own attempts"
  on public.prop_attempts for insert
  with check (user_id = auth.uid() and public.is_member());

create policy "update own attempts"
  on public.prop_attempts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete own attempts"
  on public.prop_attempts for delete
  using (user_id = auth.uid());

create or replace function public.prop_attempts_stamp()
returns trigger
language plpgsql
as $$
begin
  new.user_id := coalesce(new.user_id, auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists prop_attempts_stamped on public.prop_attempts;

create trigger prop_attempts_stamped
  before insert or update on public.prop_attempts
  for each row execute function public.prop_attempts_stamp();


-- ---------------------------------------------------------------------------
-- Everything already configured becomes attempt 1
--
-- Guarded on the account having no attempts yet, so running this twice does not
-- create a second one. The outcome carries across from the status that was
-- already there, and an account with no start date is dated from its first
-- trade rather than from today - dating it today would hide every trade it has.
-- ---------------------------------------------------------------------------

insert into public.prop_attempts
  (user_id, account, attempt, started_on, ended_on, outcome, profit_target, drawdown)
select
  p.user_id,
  p.account,
  1,
  coalesce(
    p.started_on,
    (select min(t.opened_at)::date from public.trades t
      where t.user_id = p.user_id and t.account = p.account),
    current_date),
  case when coalesce(p.status, 'active') = 'active' then null
       else coalesce(p.settled_on, current_date) end,
  coalesce(p.status, 'active'),
  p.profit_target,
  p.drawdown
from public.prop_accounts p
where not exists (
  select 1 from public.prop_attempts a
   where a.user_id = p.user_id and a.account = p.account
);


-- ---------------------------------------------------------------------------
-- prop_accounts.status, started_on and settled_on are now legacy
--
-- Left in place rather than dropped: dropping a column somebody may be reading
-- is a different kind of change, and these cost nothing sitting there. The page
-- reads attempts. If the two ever disagree, the attempt is right - it is the
-- one that can describe more than one life.
-- ---------------------------------------------------------------------------

comment on column public.prop_accounts.status is
  'LEGACY. Superseded by prop_attempts.outcome; kept so nothing breaks.';
comment on column public.prop_accounts.started_on is
  'LEGACY. Superseded by prop_attempts.started_on.';
comment on column public.prop_accounts.settled_on is
  'LEGACY. Superseded by prop_attempts.ended_on.';


-- ---------------------------------------------------------------------------
-- Check. Expect one row per configured account, attempt 1, and an outcome
-- matching whatever the status said.
-- ---------------------------------------------------------------------------
--
--   select account, attempt, started_on, ended_on, outcome
--     from public.prop_attempts
--    order by account, attempt;
--
-- And the constraint that matters, which should fail:
--
--   insert into public.prop_attempts (account, attempt, started_on)
--   values ('<an account that already has an active attempt>', 99, current_date);
-- ---------------------------------------------------------------------------
