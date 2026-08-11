-- ===========================================================================
-- Backfill the session on trades that were imported without one
--
-- Run in the Supabase SQL editor. Safe to re-run: it only ever fills a blank.
--
-- The importer derives session_kz from the trade's own timestamp, but it does
-- so at import time. Trades imported before that existed carry an empty
-- session, and re-importing is the only thing that would fix them — which is
-- fine while a file is the only source and destructive once a trade has been
-- edited by hand, because the re-import overwrites the edit.
--
-- This fills the gap without touching anything else.
--
-- WHAT IT WILL NOT DO
--
-- It only writes where session_kz is null or blank. A session you typed
-- yourself is left exactly as it is, even if this would have chosen a different
-- one — you were there and this query was not.
--
-- THE WINDOWS
--
-- These strings must match `SESSIONS` in app.js character for character. The
-- statistics page slices on the string, so "London killzone" and
-- "London 02:00-05:00" would be two rows in a table that should have been one.
--
-- Order matters here in a way it does not in app.js: a CASE takes the first
-- match, so the narrower window has to be listed first. Opening range sits
-- inside New York.
--
-- 00:00-02:00, 05:00-07:00 and 16:00-20:00 are deliberately unnamed. A trade
-- there keeps its blank rather than being given a session it was not in.
--
-- TIME ZONE
--
-- `at time zone 'America/New_York'` converts the stored timestamptz to New York
-- wall-clock time, which is what every window in this methodology is defined
-- in. It handles daylight saving correctly, which a fixed offset would not —
-- and this data spans August, so a hardcoded -5 would put every trade an hour
-- out.
-- ===========================================================================


update public.trades
   set session_kz = case
         when t.local_time >= time '09:30' and t.local_time < time '10:00'
              then 'Opening range 09:30-10:00'
         when t.local_time >= time '07:00' and t.local_time < time '10:00'
              then 'New York 07:00-10:00'
         when t.local_time >= time '10:00' and t.local_time < time '11:00'
              then 'Silver bullet 10:00-11:00'
         when t.local_time >= time '11:00' and t.local_time < time '12:00'
              then 'Late morning 11:00-12:00'
         when t.local_time >= time '12:00' and t.local_time < time '13:30'
              then 'Lunch 12:00-13:30'
         when t.local_time >= time '13:30' and t.local_time < time '15:00'
              then 'Afternoon 13:30-15:00'
         when t.local_time >= time '15:00' and t.local_time < time '16:00'
              then 'Into the close 15:00-16:00'
         when t.local_time >= time '20:00'
              then 'Asian 20:00-00:00'
         when t.local_time >= time '02:00' and t.local_time < time '05:00'
              then 'London 02:00-05:00'
         else null
       end
  from (
        select id,
               (opened_at at time zone 'America/New_York')::time as local_time
          from public.trades
         where opened_at is not null
           and coalesce(session_kz, '') = ''
       ) as t
 where public.trades.id = t.id
   and case
         when t.local_time >= time '09:30' and t.local_time < time '10:00' then true
         when t.local_time >= time '07:00' and t.local_time < time '10:00' then true
         when t.local_time >= time '10:00' and t.local_time < time '16:00' then true
         when t.local_time >= time '20:00'                                then true
         when t.local_time >= time '02:00' and t.local_time < time '05:00' then true
         else false
       end;


-- ---------------------------------------------------------------------------
-- What it did. Run this after, on its own.
--
-- Expect `blank` to be the count of trades outside every named window plus any
-- with no timestamp. **Zero blanks is not a fault**: it means every trade fell
-- inside a named session, which is ordinary for anyone who only trades the New
-- York day. What would be a fault is a window's earliest or latest straying
-- past its own boundary, which is why this reports both.
-- ---------------------------------------------------------------------------

-- select coalesce(nullif(session_kz, ''), '(blank)') as session,
--        count(*)                                    as trades,
--        min((opened_at at time zone 'America/New_York')::time) as earliest,
--        max((opened_at at time zone 'America/New_York')::time) as latest
--   from public.trades
--  group by 1
--  order by 2 desc;
