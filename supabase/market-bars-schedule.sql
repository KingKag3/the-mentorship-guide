-- ===========================================================================
-- Run the bar fetch every night
--
-- Run in the Supabase SQL editor AFTER market-bars.sql, and after the Edge
-- Function has been deployed - see supabase/functions/fetch-bars/README.md.
-- Idempotent: re-running replaces the schedule rather than adding a second one.
--
-- Step 2 contains a secret and is the one statement in this repo that must NOT
-- be committed with its value filled in. It is written here with a placeholder
-- on purpose. Paste the real key into the editor, run it, and leave this file
-- as it is.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The two extensions
--
-- pg_cron runs the schedule. pg_net makes the HTTP call - Postgres cannot
-- reach an Edge Function without it, which is the part people discover last.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;


-- ---------------------------------------------------------------------------
-- 2. The service-role key, in the vault rather than in the schedule
--
-- The cron job has to authenticate as something, and the only caller the
-- function accepts besides an admin is the service role. Writing that key into
-- the job body would put it in `cron.job`, readable by anything with the right
-- grants and dumped by every backup - so it goes in Supabase's vault and the
-- job reads it by name.
--
-- REPLACE the placeholder, run this once, and do not commit the result.
-- Dashboard -> Project Settings -> API -> service_role key.
--
--   select vault.create_secret(
--     'PASTE_SERVICE_ROLE_KEY_HERE',
--     'fetch_bars_key',
--     'Service role key used by the nightly market_bars fetch');
--
-- Already created it and need to change it:
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'fetch_bars_key'),
--     'PASTE_NEW_KEY_HERE');
--
-- Check it is there without printing it:
--
--   select name, created_at from vault.secrets where name = 'fetch_bars_key';
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 3. The schedule
--
-- 04:30 UTC daily. The reason for that number rather than a rounder one:
--
--   - A session is labelled by its close, 17:00 New York. The fetch has to run
--     after that or it collects half a day.
--   - 04:30 UTC is 00:30 New York in summer and 23:30 the previous evening in
--     winter - comfortably after the close either way, and comfortably before
--     the next session's 18:00 open matters.
--   - Cron here runs on UTC, and UTC has no daylight saving, so one expression
--     is right all year. Scheduling in local time is what produces a job that
--     drifts an hour twice a year and nobody notices until the bars do.
--
-- Every day rather than weekdays. A weekend run finds nothing new and costs one
-- query - and it is what picks up a member importing March in April, because
-- the function asks which sessions are missing rather than assuming "yesterday".
-- ---------------------------------------------------------------------------

select cron.unschedule('fetch-bars-nightly')
 where exists (select 1 from cron.job where jobname = 'fetch-bars-nightly');

select cron.schedule(
  'fetch-bars-nightly',
  '30 4 * * *',
  $job$
  select net.http_post(
    url     := 'https://djqpgdchknwgmjmkagnr.supabase.co/functions/v1/fetch-bars',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (
                    select decrypted_secret from vault.decrypted_secrets
                     where name = 'fetch_bars_key' limit 1)),
    body    := '{}'::jsonb,
    -- The sweep pauses between sessions to be gentle with a free endpoint, so
    -- a first run covering sixty days is minutes rather than seconds. pg_net
    -- only waits for the response; the function keeps running either way.
    timeout_milliseconds := 300000
  );
  $job$
);


-- ---------------------------------------------------------------------------
-- 4. Check
-- ---------------------------------------------------------------------------
--
--   select jobname, schedule, active from cron.job;
--
--   -- Did last night's call go out, and what came back:
--   select start_time, status, return_message
--     from cron.job_run_details
--    where jobname = 'fetch-bars-nightly'
--    order by start_time desc limit 5;
--
--   -- What the function actually did, which is the more useful question:
--   select status, count(*), max(updated_at)
--     from public.bar_fetch_log group by status;
--
-- A row in `cron.job_run_details` says the call was MADE. It says nothing about
-- whether bars landed - pg_net returns as soon as the request is accepted. The
-- second query is the one that answers that, and the two disagreeing is the
-- normal way this breaks.
--
-- To stop it:  select cron.unschedule('fetch-bars-nightly');
-- ---------------------------------------------------------------------------
