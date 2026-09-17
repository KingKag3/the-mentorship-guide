-- ===========================================================================
-- Marks on the chart
--
-- Run in the Supabase SQL editor after market-bars.sql. Idempotent, safe to
-- re-run.
--
-- A note pinned to a moment and a price: "added here", "this is where it went
-- against me", "should have been out by now". Private to the member, like the
-- day note, and for the same reason - it is what somebody says to themselves
-- about their own trading.
--
--
-- WHY THIS IS NOT `day_notes`, AND NOT `trades.notes`
--
-- Both of those already exist and neither can hold this.
--
-- `day_notes` is one row per day. It answers "how did today go" and has nowhere
-- to put "at 09:47, right here at 29,704". `trades.notes` is attached to a fill
-- and inherits its time; the moment somebody wants to mark is usually NOT a
-- fill - it is the level they should have waited for, the candle that told them
-- they were wrong, the point the trade turned over. A note about the trade that
-- did not happen has no trade to hang on.
--
-- So a mark carries its own instant and its own price, and belongs to the
-- session rather than to any row in `trades`.
--
--
-- WHAT `at` AND `price` MEAN
--
-- `at` is an absolute instant, the same as a bar's `ts`, because that is what
-- it is drawn against. `price` is the level the member pointed at - not
-- snapped to a candle, for the same reason a fill marker is not: moving it to
-- tidy the picture would put words in their mouth about where they meant.
--
-- `price` is nullable on purpose. "The whole afternoon was a mistake" is about
-- a time and not a level, and such a mark is drawn as a line down the chart
-- rather than a pin on it.
-- ===========================================================================


create table if not exists public.chart_marks (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null default auth.uid()
                         references auth.users on delete cascade,

  -- Which chart it belongs on. `symbol` is the ROOT, matching market_bars, so
  -- a mark made on an NQ chart shows on the NQ chart whether the trade that
  -- prompted it was NQ or MNQ.
  symbol     text        not null,
  at         timestamptz not null,
  price      numeric,

  body       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/* Bounded and not blank, the same rule the day note follows: an empty mark is
 * deleted rather than stored, so a blank row can only mean something went
 * wrong - and a pin with nothing behind it is worse than no pin. */
alter table public.chart_marks drop constraint if exists chart_marks_body_check;
alter table public.chart_marks
  add constraint chart_marks_body_check
  check (length(btrim(body)) between 1 and 2000);

comment on table public.chart_marks is
  'A member''s own note pinned to an instant and a price on a session chart. '
  'Private: no mentor policy, by design.';
comment on column public.chart_marks.price is
  'The level pointed at, never snapped to a candle. Null means the mark is '
  'about a time rather than a level, and is drawn as a line.';

-- The read the chart does: my marks, this symbol, this window.
create index if not exists chart_marks_window_idx
  on public.chart_marks (user_id, symbol, at);


-- ---------------------------------------------------------------------------
-- Row-level security: your own, and nothing else, for anybody
-- ---------------------------------------------------------------------------

alter table public.chart_marks enable row level security;

drop policy if exists "read own marks"   on public.chart_marks;
drop policy if exists "write own marks"  on public.chart_marks;
drop policy if exists "update own marks" on public.chart_marks;
drop policy if exists "delete own marks" on public.chart_marks;

create policy "read own marks"
  on public.chart_marks for select
  using (user_id = auth.uid());

create policy "write own marks"
  on public.chart_marks for insert
  with check (user_id = auth.uid() and public.is_member());

create policy "update own marks"
  on public.chart_marks for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete own marks"
  on public.chart_marks for delete
  using (user_id = auth.uid());


-- ---------------------------------------------------------------------------
-- updated_at, set by the database rather than trusted from the page
-- ---------------------------------------------------------------------------

create or replace function public.chart_marks_stamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists chart_marks_stamped on public.chart_marks;

create trigger chart_marks_stamped
  before update on public.chart_marks
  for each row execute function public.chart_marks_stamp();


-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
--
--   select symbol, at, price, left(body, 50)
--     from public.chart_marks order by at desc limit 10;
--
-- Empty until somebody marks a chart. As always, this editor is the table
-- owner and ignores the policies - it will show every member's marks, which is
-- the editor rather than a leak. Proving the policies needs a second signed-in
-- member; see RLS-ATTACK-TESTS.md.
-- ---------------------------------------------------------------------------
