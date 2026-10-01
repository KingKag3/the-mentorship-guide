-- ===========================================================================
-- An account that has stopped without being over
--
-- Run in the Supabase SQL editor after prop-accounts.sql. Safe to re-run.
--
--
-- WHY THIS EXISTS
--
-- `status` has held four values since the table was created: active, passed,
-- failed, retired. Every one of the last three is FINAL - the account is done
-- and the trading has moved somewhere else - and the site reads them that way:
-- `retiredAccounts` in `app.js` treats all three as finished, which greys the
-- card, drops the name from the importer's suggestions, and takes the account
-- out of the default view on the calendar and the statistics.
--
-- A live margin account with $99 left in it is none of those things. It has
-- not passed, it has not been blown, and it has not been closed. It cannot
-- open a position - a Micro Nasdaq needs $100 intraday - so it is not being
-- traded either, and marking it `active` says something untrue about an
-- account that is one deposit away from being real again.
--
-- `paused` is that state, and it is NOT a kind of finished. Lumping it in
-- would make the Finished pile mean two incompatible things - "this is over"
-- and "this is waiting" - which is the exact mistake the kind tags made on
-- 30 September and had to be corrected for the same reason: a label that means
-- two things tells you neither.
--
--
-- SO IT DELIBERATELY DOES NOT RETIRE AN ACCOUNT
--
-- A paused account keeps its place among the ones still being traded, carries
-- a tag saying it is paused, and stays on the importer's list - because trades
-- for it may well still arrive, which is precisely what distinguishes it from
-- a passed evaluation the firm has closed.
--
-- `tools/probe-retired-accounts.mjs` asserts that, so that nobody tidying the
-- status list later quietly folds it in with the final three.
-- ===========================================================================

alter table public.prop_accounts
  drop constraint if exists prop_accounts_status_check;

alter table public.prop_accounts
  add constraint prop_accounts_status_check
  check (status in ('active', 'paused', 'passed', 'failed', 'retired'));

comment on column public.prop_accounts.status is
  'active, paused, passed, failed or retired. The last three are final and the '
  'site treats them as finished; `paused` is not - it is an account that has '
  'stopped without being over, and it stays in the default view.';


-- ---------------------------------------------------------------------------
-- Check it took. The first expects five values in the constraint; the second
-- should succeed and then leave nothing behind.
-- ---------------------------------------------------------------------------
-- select pg_get_constraintdef(oid)
--   from pg_constraint
--  where conname = 'prop_accounts_status_check';
--
-- select 'paused'::text in ('active', 'paused', 'passed', 'failed', 'retired') as ok;
