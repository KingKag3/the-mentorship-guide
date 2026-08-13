-- ===========================================================================
-- When each member was last here
--
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- WHY THE SITE HAS TO RECORD THIS ITSELF
--
-- Supabase already knows: auth.users.last_sign_in_at. Reading that table needs
-- the service_role key, and this site is static - everything it ships is a
-- browser, and a browser is the one place that key must never be. It is the
-- same wall the admin password-reset feature hit, recorded at the bottom of
-- profiles-self-service.sql.
--
-- So: one column, written by the member's own client.
--
--
-- THERE IS NO NEW POLICY HERE, AND THAT IS DELIBERATE
--
-- profiles-self-service.sql already grants "update own profile" over the row,
-- and row-level security answers WHICH ROWS rather than which columns. A member
-- updating their own last_seen_at is the policy already in place, doing exactly
-- what it says.
--
-- The column guard on that table is a trigger, and it has opinions about
-- exactly three columns - role, id and email. last_seen_at is not one of them,
-- so nothing needs changing there either. Worth checking rather than assuming,
-- which is why the trigger's source is quoted here:
--
--     if new.role is distinct from old.role and not public.is_admin() then
--
-- plpgsql short-circuits that AND, so is_admin() is only called when the role
-- actually changed. A daily heartbeat write does not pay for a SECURITY DEFINER
-- function call on every page load.
--
--
-- WHAT THIS NUMBER IS, AND IS NOT
--
-- It is self-reported. The client writes it, so it records a browser opening a
-- members page. Somebody who leaves a tab open for a week is indistinguishable
-- from somebody reading every day, and somebody who never signs in writes
-- nothing at all - which is the case attrition actually cares about, so the
-- weakness sits where it does least harm.
--
-- It measures attendance, not learning. A member who stopped opening the site
-- because the material worked and they are now trading it looks exactly like
-- one who gave up. Any conclusion drawn from this column has to survive that
-- sentence.
--
-- Do not bill, gate or expel on it.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The column
--
-- Null rather than defaulting to now(): a member who has not been back since
-- this ran has genuinely not been seen, and stamping every existing row with
-- today's date would erase the very thing being measured on the day it was
-- built. Null reads as "not since this started", which is true.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

comment on column public.profiles.last_seen_at is
  'Set by the member''s own client, at most once a day. Attendance, not '
  'engagement - see supabase/member-last-seen.sql before drawing conclusions.';


-- ---------------------------------------------------------------------------
-- 2. An index, because the only question asked of this column is an ordering
--
-- "Who has not been back" is `order by last_seen_at nulls first`, over every
-- profile. Nulls first matches the query the admin page runs: the people who
-- have never been seen are the top of the list, not the bottom.
-- ---------------------------------------------------------------------------

create index if not exists profiles_last_seen_idx
  on public.profiles (last_seen_at nulls first);


-- ---------------------------------------------------------------------------
-- 3. Checks worth running once
-- ---------------------------------------------------------------------------

-- a) The column exists and is nullable.
--
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'profiles'
--    and column_name = 'last_seen_at';

-- b) Still four policies on profiles, and still one trigger. This migration
--    adds neither, so anything else here means something else changed.
--
-- select policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename = 'profiles'
--  order by policyname;

-- c) The list the admin page draws. Every row null on the first day is correct
--    and expected - the column is filled by people visiting, not by this.
--
-- select email, role, created_at::date as joined, last_seen_at,
--        case when last_seen_at is null then null
--             else (current_date - last_seen_at::date) end as days_away
--   from public.profiles
--  order by last_seen_at nulls first;
