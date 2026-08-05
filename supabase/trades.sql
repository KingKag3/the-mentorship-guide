-- ===========================================================================
-- Trade journal
--
-- Run in the Supabase SQL editor after schema.sql. Safe to re-run.
--
-- Every row belongs to exactly one member and is invisible to everyone else,
-- including other members. The only exception is opt-in: a member can flag a
-- single trade for the mentor to see, and that flag widens the read policy for
-- that row alone.
--
-- The tagging columns are not free text by accident. They are the curriculum's
-- own vocabulary, so that the statistics page can answer "which of the things
-- I was taught actually works for me" rather than "how did I do last month".
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table if not exists public.trades (
  id                bigint generated always as identity primary key,
  user_id           uuid        not null default auth.uid()
                                references auth.users on delete cascade,

  -- What and when
  opened_at         timestamptz not null default now(),
  symbol            text        not null default 'NQ',
  direction         text        not null default 'long'
                                check (direction in ('long', 'short')),

  -- The curriculum tags. Free text rather than enums on purpose: the
  -- vocabulary will grow, and a member inventing a name for something they
  -- keep doing is a signal worth keeping rather than a constraint violation.
  model             text,   -- 2022 entry, silver bullet, turtle soup, ATM...
  session_kz        text,   -- london, new york, silver bullet, afternoon...
  pd_array          text,   -- fair value gap, order block, breaker...
  liquidity         text,   -- asian high, PDL, PM low, equal highs...
  bias              text,   -- bullish, bearish, none
  agreed_with_bias  boolean,
  checklist_done    boolean not null default false,

  -- The numbers
  entry             numeric,
  stop              numeric,
  target            numeric,
  exit_price        numeric,
  contracts         numeric,
  points            numeric,
  r_multiple        numeric,
  outcome           text    check (outcome in ('win', 'loss', 'breakeven', 'scratch')),

  -- The words
  management        text,
  notes             text,
  screenshot_path   text,

  shared_with_mentor boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists trades_user_idx     on public.trades (user_id, opened_at desc);
create index if not exists trades_model_idx    on public.trades (user_id, model);
create index if not exists trades_session_idx  on public.trades (user_id, session_kz);


-- ---------------------------------------------------------------------------
-- 2. Row-level security
--
-- Note what is absent: there is no policy letting a member read another
-- member's trades under any circumstance, and no policy letting an admin write
-- to them. A mentor can look at what was shared; nobody can edit your journal
-- but you.
-- ---------------------------------------------------------------------------

alter table public.trades enable row level security;

drop policy if exists "read own trades"    on public.trades;
drop policy if exists "insert own trades"  on public.trades;
drop policy if exists "update own trades"  on public.trades;
drop policy if exists "delete own trades"  on public.trades;
drop policy if exists "admins read shared" on public.trades;

create policy "read own trades"
  on public.trades for select
  using (user_id = auth.uid());

create policy "insert own trades"
  on public.trades for insert
  with check (user_id = auth.uid() and public.is_member());

create policy "update own trades"
  on public.trades for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete own trades"
  on public.trades for delete
  using (user_id = auth.uid());

-- Opt-in only, and read-only. The row has to be flagged by its owner.
create policy "admins read shared"
  on public.trades for select
  using (shared_with_mentor and public.is_admin());


-- ---------------------------------------------------------------------------
-- 3. Keep updated_at honest
-- ---------------------------------------------------------------------------

create or replace function public.touch_trade()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trades_touch on public.trades;

create trigger trades_touch
  before update on public.trades
  for each row execute function public.touch_trade();


-- ---------------------------------------------------------------------------
-- 4. Screenshots
--
-- Journal images go into the existing private lesson-media bucket under a
-- journal/ prefix. storage.sql already restricts that bucket to members; these
-- two policies narrow it further so a member can only reach their own folder.
--
-- Paths are journal/<user id>/<uuid>.<ext>, which is what makes the owner
-- check below possible.
-- ---------------------------------------------------------------------------

drop policy if exists "members write own journal media" on storage.objects;
drop policy if exists "members read own journal media"  on storage.objects;

create policy "members write own journal media"
  on storage.objects for insert
  with check (
    bucket_id = 'lesson-media'
    and public.is_member()
    and (storage.foldername(name))[1] = 'journal'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "members read own journal media"
  on storage.objects for select
  using (
    bucket_id = 'lesson-media'
    and (storage.foldername(name))[1] = 'journal'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
