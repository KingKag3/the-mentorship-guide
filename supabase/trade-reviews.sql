-- ===========================================================================
-- Mentor replies
--
-- Run in the Supabase SQL editor after trades.sql. Safe to re-run.
--
-- Why this is a table and not a column on trades
-- ----------------------------------------------
-- The Review tab needed two things it could not have: somewhere to put a
-- reply, and a way to clear a trade out of the queue once it had been answered.
-- The obvious version of the second one is to let an admin untick
-- shared_with_mentor, and that is exactly what trades.sql refuses:
--
--     there is no policy letting a member read another member's trades under
--     any circumstance, and no policy letting an admin write to them. A mentor
--     can look at what was shared; nobody can edit your journal but you.
--
-- An exception for a well-meant write is still an exception. So the reply lives
-- in its own table, owned by whoever wrote it, and the queue is derived rather
-- than stored: a shared trade is waiting if nobody has answered it since the
-- last time its owner touched it. Nothing writes to public.trades, and the
-- member's tick stays the member's.
--
-- The reopen rule comes free with that
-- ------------------------------------
-- public.trades already maintains updated_at through the trades_touch trigger.
-- So "answered" means a review newer than the trade's own updated_at, and a
-- member who edits a trade after being answered puts it back in the queue by
-- doing so. That is the behaviour wanted, and it costs a comparison rather
-- than a state machine.
--
-- What this deliberately is not, yet
-- ----------------------------------
-- Not a thread. Only an admin may write, so a member cannot answer back inside
-- the app. Adding that later is one insert policy and no schema change - the
-- author_id column is already there and already defaults to the caller - but it
-- also needs somewhere for a member to type, an unread count, and a rule for
-- what an unanswered reply-to-a-reply does to the queue. None of that is worth
-- guessing at before the simple version has been used.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table if not exists public.trade_reviews (
  id          bigint generated always as identity primary key,

  trade_id    bigint      not null
                          references public.trades on delete cascade,

  -- Who wrote it. Defaults to the caller so the insert policy below has
  -- something to check against rather than something to trust.
  author_id   uuid        not null default auth.uid()
                          references auth.users on delete cascade,

  body        text        not null check (length(btrim(body)) > 0),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The queue asks "what is the newest reply on each of these trades", every
-- time the Review tab loads.
create index if not exists trade_reviews_trade_idx
  on public.trade_reviews (trade_id, created_at desc);


-- ---------------------------------------------------------------------------
-- 2. Row-level security
--
-- Note what is absent, in the same spirit as trades.sql: no policy lets a
-- member write here, and no policy lets one member read a reply written on
-- somebody else's trade. A mentor may write and revise their own words; a
-- member may read what was written about their own trade and nothing else.
-- ---------------------------------------------------------------------------

alter table public.trade_reviews enable row level security;

drop policy if exists "read reviews on own trades" on public.trade_reviews;
drop policy if exists "admins read reviews"        on public.trade_reviews;
drop policy if exists "admins write reviews"       on public.trade_reviews;
drop policy if exists "admins edit own reviews"    on public.trade_reviews;
drop policy if exists "admins delete own reviews"  on public.trade_reviews;

-- The member the reply is about. Reached through the trade, because that is
-- where ownership lives - there is no user_id on this table to get out of step
-- with the one on trades.
create policy "read reviews on own trades"
  on public.trade_reviews for select
  using (
    exists (
      select 1 from public.trades t
       where t.id = trade_id
         and t.user_id = auth.uid()
    )
  );

create policy "admins read reviews"
  on public.trade_reviews for select
  using (public.is_admin());

-- Writing requires being an admin *and* claiming your own name. The default on
-- author_id makes the second half automatic for an honest client; the check
-- makes it true for every other kind.
create policy "admins write reviews"
  on public.trade_reviews for insert
  with check (public.is_admin() and author_id = auth.uid());

create policy "admins edit own reviews"
  on public.trade_reviews for update
  using (public.is_admin() and author_id = auth.uid())
  with check (public.is_admin() and author_id = auth.uid());

create policy "admins delete own reviews"
  on public.trade_reviews for delete
  using (public.is_admin() and author_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 3. Keep updated_at honest
--
-- Same shape as trades_touch, and separate from it on purpose: a shared
-- trigger function across two tables is one edit away from surprising the
-- other one.
-- ---------------------------------------------------------------------------

create or replace function public.touch_trade_review()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trade_reviews_touch on public.trade_reviews;

create trigger trade_reviews_touch
  before update on public.trade_reviews
  for each row execute function public.touch_trade_review();


-- ---------------------------------------------------------------------------
-- 4. What existing data does
--
-- Nothing to migrate: the table is new and starts empty. Every trade already
-- shared stays shared and appears in the queue as unanswered, which is
-- accurate - none of them have been answered in the app, because there was
-- nowhere to do it.
--
-- Deleting a trade deletes its replies with it, by cascade. That is the right
-- way round: a critique of a trade that no longer exists is not worth keeping,
-- and the member deleting their own row should not be blocked by somebody
-- else's comment on it.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 5. Checks worth running once
-- ---------------------------------------------------------------------------

-- a) The queue, exactly as the Review tab computes it. Expect every shared
--    trade to be listed as waiting until something is written.
--
-- select t.id, t.updated_at, max(r.created_at) as answered_at,
--        (max(r.created_at) is null or max(r.created_at) < t.updated_at) as waiting
--   from public.trades t
--   left join public.trade_reviews r on r.trade_id = t.id
--  where t.shared_with_mentor
--  group by t.id, t.updated_at
--  order by t.opened_at desc;

-- b) Five policies, and no member write among them.
--
-- select policyname, permissive, cmd
--   from pg_policies
--  where schemaname = 'public' and tablename = 'trade_reviews'
--  order by cmd, policyname;
