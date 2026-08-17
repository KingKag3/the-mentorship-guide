-- ===========================================================================
-- Set a shared trade aside without answering it
--
-- Run in the Supabase SQL editor after trade-reviews.sql. Safe to re-run.
--
-- THE GAP THIS FILLS
--
-- The mentor's queue is derived, never stored: a shared trade is waiting when
-- the last word was the member's, or when the newest mentor message predates
-- the trade's updated_at. That is deliberate and stays - see trade-reviews.sql
-- for why the queue does not live on public.trades.
--
-- But a derived rule can only say "answered" or "not answered". A trade you
-- have read and decided needs no reply - a duplicate, one of twenty shared in
-- a batch and answered collectively, a question that answered itself - has
-- nowhere to go. It sits in Waiting for ever and inflates the badge until the
-- badge stops meaning anything.
--
--
-- WHY IT IS A TABLE AND NOT A COLUMN ON trades
--
-- The same reason the replies are. `trades.sql` refuses to let an admin write
-- to somebody else's journal row under any circumstance, and "it would be
-- convenient" is how that rule gets broken. Nothing here touches public.trades.
--
--
-- A DISMISSAL EXPIRES, AND THAT IS THE WHOLE DESIGN
--
-- If setting a trade aside were permanent it would be a silencer: the member
-- asks a follow-up on a trade you set aside last month, and nobody ever sees
-- it. So the row records WHEN, and the queue compares that timestamp against
-- everything the member has done since.
--
--     set aside, then the member edits the trade   -> back in the queue
--     set aside, then the member writes a message  -> back in the queue
--     set aside, and the member does nothing       -> stays out
--
-- Nothing needs clearing up. A stale dismissal is simply an old timestamp that
-- loses every comparison, which is the same trick the answered rule already
-- uses against updated_at.
--
--
-- ONE ROW PER TRADE, NOT PER MENTOR
--
-- Today the queue is a shared pool and "this needs no answer" is a fact about
-- the trade rather than an opinion one mentor holds. `dismissed_by` records who
-- decided, because an unattributable decision is not reviewable - but it is not
-- part of the key.
--
-- When mentors become a role and questions get directed at a person (ROADMAP.md
-- 5.2), revisit this. Making it per-mentor later is a primary key change and a
-- backfill; making it per-mentor now is a guess about a feature nobody has
-- built.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table if not exists public.trade_review_dismissals (
  trade_id      bigint      primary key
                            references public.trades on delete cascade,

  -- Who decided. Defaults to the caller so the insert policy has something to
  -- check rather than something to trust.
  dismissed_by  uuid        not null default auth.uid()
                            references auth.users on delete cascade,

  dismissed_at  timestamptz not null default now(),

  -- Optional, and worth having. "Duplicate of the 09:41 entry" is the
  -- difference between a decision and a shrug when somebody reads this back.
  reason        text
);


-- ---------------------------------------------------------------------------
-- 2. Row-level security
--
-- Admin only, in every direction, and note what is absent: NO policy lets a
-- member read this. A member being shown "your mentor decided not to answer
-- this" is unkind and tells them nothing they can act on. The trade simply
-- stays as they left it, shared and unanswered.
-- ---------------------------------------------------------------------------

alter table public.trade_review_dismissals enable row level security;

drop policy if exists "admins read dismissals"   on public.trade_review_dismissals;
drop policy if exists "admins write dismissals"  on public.trade_review_dismissals;
drop policy if exists "admins update dismissals" on public.trade_review_dismissals;
drop policy if exists "admins undo dismissals"   on public.trade_review_dismissals;

create policy "admins read dismissals"
  on public.trade_review_dismissals for select
  using (public.is_admin());

create policy "admins write dismissals"
  on public.trade_review_dismissals for insert
  with check (public.is_admin() and dismissed_by = auth.uid());

-- Setting aside a trade that was already set aside re-stamps it rather than
-- failing on the primary key, which is what the page's upsert relies on.
create policy "admins update dismissals"
  on public.trade_review_dismissals for update
  using      (public.is_admin())
  with check (public.is_admin() and dismissed_by = auth.uid());

create policy "admins undo dismissals"
  on public.trade_review_dismissals for delete
  using (public.is_admin());


-- ---------------------------------------------------------------------------
-- 3. Checks worth running once
-- ---------------------------------------------------------------------------

-- a) Four policies, none of them granting a member anything.
--
-- select policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename = 'trade_review_dismissals'
--  order by cmd, policyname;

-- b) The queue, with dismissals applied, exactly as the page computes it.
--    `still_waiting` should be false only where the mentor answered last, or
--    where the dismissal is newer than anything the member has done since.
--
-- select t.id,
--        t.updated_at,
--        d.dismissed_at,
--        max(r.created_at) filter (where r.author_id =  t.user_id) as member_last,
--        max(r.created_at) filter (where r.author_id <> t.user_id) as mentor_last
--   from public.trades t
--   left join public.trade_reviews r            on r.trade_id = t.id
--   left join public.trade_review_dismissals d  on d.trade_id = t.id
--  where t.shared_with_mentor
--  group by t.id, t.user_id, t.updated_at, d.dismissed_at
--  order by t.opened_at desc;

-- c) The one that cannot be checked here. A MEMBER must get nothing at all
--    from this table, and no query run as the table owner will show that -
--    RLS does not apply to the owner. It needs a second signed-in account.
