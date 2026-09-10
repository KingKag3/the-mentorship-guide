-- ===========================================================================
-- Notes on the day
--
-- Run in the Supabase SQL editor after schema.sql. Idempotent, safe to re-run.
--
-- One note per member per calendar day, written from the journal or the
-- calendar and shown on the calendar grid. Private: there is no mentor policy,
-- and none is intended. A trade is shared one row at a time, on purpose, by
-- the member; a note about how the day felt was never offered to anybody.
--
--
-- WHY A DAY AND NOT A TRADE
--
-- `trades.notes` already exists, and it is the wrong unit for most of what a
-- member wants to say. "Sat out - CPI at 8:30" is about a day with no trades in
-- it, so there is no row to put it on. "Chased the open, knew it" is about the
-- morning, not about one of the five fills that followed.
--
-- And for anybody running copied prop accounts it is the only practical place
-- the reasoning can go. One decision arrives as eighteen imported rows; writing
-- the why eighteen times is not going to happen, and writing it on one of them
-- at random puts it on an account that means nothing. The day is the thing they
-- actually decided about.
--
-- A day with a note and no trades is also data this project did not have: a
-- day somebody chose not to trade. That is a decision, and it has been
-- invisible, because nothing records the absence of a row.
--
--
-- WHAT `day` MEANS
--
-- The member's local calendar day, as a DATE - the same key the calendar
-- groups trades by (app.js `localDay`). Not a timestamp: a note written at
-- 23:50 about this morning belongs to this morning, and converting through UTC
-- would file an evening in New York under tomorrow.
-- ===========================================================================


create table if not exists public.day_notes (
  user_id    uuid        not null default auth.uid()
                         references auth.users on delete cascade,
  day        date        not null,
  body       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

/* Bounded, and not empty. An empty note is deleted rather than stored - the
 * page does that - so a blank row can only mean something went wrong, and the
 * constraint says so at the database rather than leaving a row that draws a
 * note marker over nothing.
 *
 * Eight thousand characters is several pages of prose. The limit is there so
 * that a paste of something enormous fails loudly instead of quietly becoming
 * part of every calendar load. */
alter table public.day_notes drop constraint if exists day_notes_body_check;
alter table public.day_notes
  add constraint day_notes_body_check
  check (length(btrim(body)) between 1 and 8000);

comment on table public.day_notes is
  'One private note per member per local calendar day. No mentor access.';
comment on column public.day_notes.day is
  'The member''s local day, matching how the calendar groups trades. A date, '
  'not a timestamp, so an evening note is never filed under tomorrow via UTC.';


-- ---------------------------------------------------------------------------
-- Row-level security: your own rows, and nothing else, for anybody
-- ---------------------------------------------------------------------------

alter table public.day_notes enable row level security;

drop policy if exists "read own day notes"   on public.day_notes;
drop policy if exists "write own day notes"  on public.day_notes;
drop policy if exists "update own day notes" on public.day_notes;
drop policy if exists "delete own day notes" on public.day_notes;

create policy "read own day notes"
  on public.day_notes for select
  using (user_id = auth.uid());

create policy "write own day notes"
  on public.day_notes for insert
  with check (user_id = auth.uid() and public.is_member());

create policy "update own day notes"
  on public.day_notes for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete own day notes"
  on public.day_notes for delete
  using (user_id = auth.uid());


-- ---------------------------------------------------------------------------
-- updated_at, set by the database rather than trusted from the page
-- ---------------------------------------------------------------------------

create or replace function public.day_notes_stamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists day_notes_stamped on public.day_notes;

create trigger day_notes_stamped
  before update on public.day_notes
  for each row execute function public.day_notes_stamp();


-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
--
--   select day, left(body, 60), updated_at
--     from public.day_notes
--    order by day desc
--    limit 10;
--
-- Empty until somebody writes a note, which is expected.
--
-- REMEMBER THIS EDITOR IS NOT A TEST OF THE POLICIES. It runs as the table
-- owner and row-level security does not apply to it - the select above returns
-- every member's notes, and that is not a leak, it is the editor. To confirm
-- the policies, sign in as a second member and run, in the browser console:
--
--   await supabase.from('day_notes').select('*')
--
-- which must return only that member's own rows. See RLS-ATTACK-TESTS.md.
-- ---------------------------------------------------------------------------
