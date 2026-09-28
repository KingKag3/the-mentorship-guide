-- ===========================================================================
-- What the firm's own dashboard says
--
-- Run in the Supabase SQL editor after prop-accounts.sql. Safe to re-run.
--
--
-- WHY THIS EXISTS
--
-- Every figure on the accounts page is computed from `trades`, and the page
-- says so at length: the journal holds CLOSED trades, a trailing threshold at
-- most firms follows unrealised equity while a position is open, so the peak
-- the journal can see is the lowest the real peak can be. "Room left" is
-- therefore a ceiling - the most room you could possibly have - and the page
-- ends that explanation with the only honest conclusion available to it:
--
--     the firm's own dashboard is the only thing that can answer that.
--
-- This is that answer, typed in. Two numbers off the dashboard and the date
-- they were read:
--
--   * `firm_balance`   - the account value the firm shows.
--   * `firm_threshold` - the trailing threshold, AS AN ABSOLUTE ACCOUNT VALUE.
--                        Apex labels this column "Stop". It is NOT the
--                        allowance: on a 250k Legacy account the allowance is
--                        a few thousand and the threshold is a number just
--                        under a quarter of a million. The two get confused
--                        precisely because both are called the drawdown, which
--                        is why `drawdown` and this column are kept apart.
--   * `firm_seen_on`   - when it was read. A threshold is a moving number and
--                        one from three weeks ago is worse than none, because
--                        it looks current.
--
--
-- WHAT IT MAKES POSSIBLE, BEYOND THE OBVIOUS
--
-- The obvious part: room left becomes `firm_balance - firm_threshold`, exact,
-- with none of the caveats above.
--
-- The part worth the migration: it measures how wrong the estimate was. Where
-- the drawdown allowance is known and the threshold has not locked,
--
--     the firm's high-water mark = firm_threshold + drawdown
--
-- and the journal has its own high-water mark from closed trades. The gap
-- between them is exactly the unrealised profit the threshold captured and the
-- journal never saw - which is the intraday-versus-end-of-day question, asked
-- of one account, answered in dollars instead of assumed.
--
-- A gap of zero is a real finding too: this account's threshold follows closed
-- balance, so everything the page computes for it is exact rather than a floor.
--
-- And `firm_balance - size` against the journal's own total is an import
-- check. They should agree. When they do not, trades are missing, and on
-- copied accounts that is otherwise invisible - the numbers all look plausible
-- because they are the same numbers eighteen other accounts are showing.
--
--
-- WHY IT IS NOT FETCHED
--
-- Nothing here calls a firm's API or scrapes a dashboard. See DECISIONS
-- 2026-09-17 for the standing rule on outside data. A member reading two
-- numbers off a page they are already looking at costs them ten seconds and
-- owes nobody anything.
-- ===========================================================================

alter table public.prop_accounts
  add column if not exists firm_balance   numeric,
  add column if not exists firm_threshold numeric,
  add column if not exists firm_seen_on   date;

comment on column public.prop_accounts.firm_balance is
  'Account value as the firm''s dashboard shows it, typed in by the member.';

comment on column public.prop_accounts.firm_threshold is
  'The firm''s trailing threshold as an ABSOLUTE account value - Apex calls it '
  '"Stop". Not the allowance; that is prop_accounts.drawdown.';

comment on column public.prop_accounts.firm_seen_on is
  'When the two figures above were read. A threshold moves; a stale reading '
  'that looks current is worse than none.';

-- No policy changes. These are columns on a table that already restricts every
-- operation to `user_id = auth.uid()`, and a new column inherits that.


-- ---------------------------------------------------------------------------
-- Check it landed. Expect three rows.
-- ---------------------------------------------------------------------------
-- select column_name, data_type
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name = 'prop_accounts'
--    and column_name in ('firm_balance', 'firm_threshold', 'firm_seen_on')
--  order by column_name;
