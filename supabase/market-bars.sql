-- ===========================================================================
-- Price bars, shared by everybody
--
-- Run in the Supabase SQL editor after trades.sql. Idempotent, safe to re-run.
--
-- The first table on this site that is NOT member data. A 5-minute NQ candle
-- is the same candle for every member who traded that morning, so it is stored
-- once, without a `user_id`, and read by anyone signed in. There is nothing
-- private in it to scope.
--
--
-- WHAT THIS IS FOR
--
-- Drawing a member's own fills on a real chart of the session they traded.
-- Everything else on this site records what the member DID; this is the first
-- thing that records what the MARKET did, and it exists only as the backdrop
-- to the fills drawn on top of it.
--
--
-- READ THIS BEFORE EXTENDING IT - WHERE THE DATA COMES FROM, AND THE RISK
--
-- The bars are fetched from Yahoo Finance's chart endpoint by a nightly job.
-- That endpoint is not a licensed feed. It is undocumented, unofficial, free,
-- and its terms do not permit redistribution. Storing its data here and serving
-- it to members is redistribution.
--
-- This was raised on 17 September 2026 and accepted deliberately by the site's
-- owner, with the alternatives on the table: a member-supplied bar file kept
-- private to them, a paid vendor whose terms allow caching and display, or no
-- candles at all. See DECISIONS.md for that entry. It is written here as well
-- because this file is where somebody will be standing when they wonder.
--
-- What follows from it, and what the code does about it:
--
--   - The endpoint can change shape, rate-limit or block without notice. The
--     job treats failure as ordinary, records it, and the page falls back to
--     drawing fills with no candles rather than showing an error.
--   - The fetch lives behind ONE function in the Edge Function. Swapping to a
--     licensed vendor should be that function and this comment, not a rewrite.
--   - Nothing here is ever served to somebody who is not signed in, and no page
--     calls the source at request time.
--
--
-- WHY IT IS NOT PER-MEMBER
--
-- The obvious alternative was a file per member in their private bucket. It
-- was rejected because the same session would then be stored once per member
-- who traded it - the table would grow with membership rather than with
-- trading - and because eighteen copied prop accounts belonging to one person
-- would otherwise want eighteen identical copies of the same morning.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The bars
-- ---------------------------------------------------------------------------

create table if not exists public.market_bars (
  symbol      text        not null,      -- root only: 'NQ', 'ES'
  timeframe   text        not null,      -- '5m' today; room for others
  ts          timestamptz not null,      -- bar OPEN time, absolute
  open        numeric     not null,
  high        numeric     not null,
  low         numeric     not null,
  close       numeric     not null,
  volume      numeric,
  inserted_at timestamptz not null default now(),
  primary key (symbol, timeframe, ts)
);

comment on table public.market_bars is
  'Shared price bars, not member data. Backdrop for drawing a member''s own '
  'fills. Written only by the nightly fetch job under the service role.';
comment on column public.market_bars.ts is
  'Bar OPEN time as an absolute instant. Never a wall clock: the session '
  'boundary moves twice a year and a stored offset would misalign every bar '
  'on the wrong side of a DST change.';
comment on column public.market_bars.symbol is
  'Root symbol. Micros are NOT stored separately - MNQ prints the same price '
  'as NQ, so one series serves both and the page maps micro to full size.';

-- The read the chart actually does: one symbol, one timeframe, a time window.
create index if not exists market_bars_window_idx
  on public.market_bars (symbol, timeframe, ts);


-- ---------------------------------------------------------------------------
-- 2. What the job tried, and how it went
--
-- Without this, "no bars for Tuesday" has three causes that look identical:
-- nobody traded, the symbol is not tracked, or the fetch failed. The page has
-- to tell a member which, because only one of them is worth waiting for.
-- ---------------------------------------------------------------------------

create table if not exists public.bar_fetch_log (
  symbol       text        not null,
  trading_day  date        not null,     -- the CME session, labelled by its close
  status       text        not null default 'pending'
                           check (status in ('pending', 'ok', 'failed', 'empty')),
  attempts     int         not null default 0,
  bars         int,                      -- how many rows landed, when ok
  last_error   text,
  updated_at   timestamptz not null default now(),
  primary key (symbol, trading_day)
);

comment on table public.bar_fetch_log is
  'One row per symbol and session the job has tried. "empty" means the source '
  'answered with no bars - a holiday, or a day outside its history window - '
  'which is settled, unlike "failed", which is worth retrying.';


-- ---------------------------------------------------------------------------
-- 3. Which sessions are missing
--
-- The job asks this rather than working it out in TypeScript, because the
-- trading day is a Postgres expression and duplicating it in another language
-- is how the two would drift.
--
-- THE CME SESSION IS NOT A CALENDAR DAY. NQ and ES trade almost continuously,
-- with one maintenance break around 17:00-18:00 New York time, so a session
-- runs from 18:00 the previous evening to 17:00 on its own day. A trade at
-- 19:00 on Monday belongs to Tuesday's session.
--
-- `+ interval '6 hours'` on New York wall-clock time does exactly that: 18:00
-- becomes midnight the next day, 17:00 stays at 23:00 on its own. And doing it
-- `at time zone 'America/New_York'` rather than against a fixed offset is what
-- keeps it right through both DST changes.
--
-- SECURITY DEFINER, because the job reads across every member's trades to find
-- out which sessions to fetch. It returns no member data - a symbol and a date,
-- nothing that says who traded it - and it is not granted to anybody but the
-- service role.
-- ---------------------------------------------------------------------------

create or replace function public.bar_sessions_wanted(
  tracked text[],
  since_days int default 60
)
returns table (symbol text, trading_day date)
language sql
stable
security definer
set search_path = public
as $$
  with wanted as (
    select
      case
        when upper(t.symbol) in ('MNQ', 'NQ') then 'NQ'
        when upper(t.symbol) in ('MES', 'ES') then 'ES'
        else upper(t.symbol)
      end as symbol,
      (((t.opened_at at time zone 'America/New_York') + interval '6 hours')::date) as trading_day
    from public.trades t
    where t.opened_at >= now() - make_interval(days => since_days)
  )
  select w.symbol, w.trading_day
    from wanted w
   where w.symbol = any(tracked)
   group by w.symbol, w.trading_day
  -- Not already fetched, and not already settled as empty. A failed day comes
  -- back, which is the point of separating "failed" from "empty".
  except
  select l.symbol, l.trading_day
    from public.bar_fetch_log l
   where l.status in ('ok', 'empty')
$$;

revoke all on function public.bar_sessions_wanted(text[], int) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4. Row-level security
--
-- Read by any member. Written by nobody with a session - the service role
-- bypasses RLS, and it is the only thing that writes here. There is
-- deliberately no insert policy at all, not even for admins: a bar nobody can
-- vouch for is worse than a missing one, and an admin typing a candle by hand
-- is not a feature anybody asked for.
-- ---------------------------------------------------------------------------

alter table public.market_bars   enable row level security;
alter table public.bar_fetch_log enable row level security;

drop policy if exists "members read bars"      on public.market_bars;
drop policy if exists "members read bar log"   on public.bar_fetch_log;

create policy "members read bars"
  on public.market_bars for select
  using (public.is_member());

create policy "members read bar log"
  on public.bar_fetch_log for select
  using (public.is_member());


-- ---------------------------------------------------------------------------
-- 4b. Reopen any session that was recorded before it had closed
--
-- The function used to record whatever it fetched as `ok`, and `ok` is never
-- fetched again. Called by hand in the middle of a session - which is exactly
-- what happened on 17 September, at 18:25 UTC - it stored the bars that existed
-- at that moment and froze the session half-finished. The function no longer
-- does that; this repairs what it already did.
--
-- It needs no list of dates. A session closes at 17:00 New York on its own
-- day, so any `ok` or `empty` row written BEFORE that moment is by definition
-- a partial answer. Built in New York time with `at time zone`, not a fixed
-- offset, for the same reason as everything else in this file.
--
-- Setting `pending` is enough: `bar_sessions_wanted` excludes only `ok` and
-- `empty`, so the next sweep refetches these, and the upsert overwrites the
-- partial bars rather than duplicating them. Safe to re-run; it touches nothing
-- that was recorded after its session closed.
-- ---------------------------------------------------------------------------

update public.bar_fetch_log
   set status = 'pending',
       last_error = 'reopened: recorded before the session closed'
 where status in ('ok', 'empty')
   and updated_at < ((trading_day + time '17:00') at time zone 'America/New_York');


-- ---------------------------------------------------------------------------
-- 5. Check
-- ---------------------------------------------------------------------------
--
--   select symbol, timeframe, count(*), min(ts), max(ts)
--     from public.market_bars group by 1, 2;
--
--   select * from public.bar_fetch_log order by trading_day desc limit 20;
--
--   -- What the job will go and get on its next run:
--   select * from public.bar_sessions_wanted(array['NQ','ES']) order by 2 desc;
--
-- All empty until the Edge Function has run. The third query answers even
-- before then, and answering with rows is the proof that the session maths
-- reads the trades correctly.
-- ---------------------------------------------------------------------------
