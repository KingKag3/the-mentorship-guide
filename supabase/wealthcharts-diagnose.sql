-- ===========================================================================
-- What is actually in the table
--
-- Run in the Supabase SQL editor. Every statement here is a SELECT: nothing is
-- changed by any of it.
--
-- The cleanup's first section returned no rows, which has two possible
-- meanings and they want opposite responses:
--
--   * there are no stale rows, and only the re-import is needed;
--   * the rows are there but do not look the way the cleanup expects, in which
--     case running the delete would remove nothing and the totals would stay
--     wrong.
--
-- These four answer which. Run them together and send back what they say.
-- ===========================================================================


-- 1. Do these accounts exist under exactly these names?
--    Expect 19 rows, names like APEX-26922-1672, and totals near 3,300 each.
--    A total of 3,760.63 on 1672 is the inflated figure this is all about.

select account,
       count(*)                    as trades,
       round(sum(net_pnl), 2)      as total,
       min(opened_at)::date        as first_day,
       max(opened_at)::date        as last_day
  from public.trades
 where account like 'APEX%'
 group by account
 order by account;


-- 2. What does an external_id actually look like on those rows?
--    The cleanup assumes two 17-character order ids joined by a hyphen. If
--    these come back as `auto-...`, or a hash, or null, that assumption is
--    wrong and the delete could never have matched anything.

select external_id,
       length(external_id)                                   as len,
       external_id ~ '^[A-Z0-9]{17}-[A-Z0-9]{17}$'           as matches_pattern,
       account,
       opened_at::date                                       as day,
       net_pnl
  from public.trades
 where account like 'APEX%'
 order by opened_at
 limit 15;


-- 3. How many rows match the shape the cleanup looks for?
--    If `wealthcharts_shaped` is 0 while `rows` is in the hundreds, the ids are
--    not what was assumed and nothing else in this file matters until that is
--    understood.

select count(*)                                                        as rows,
       count(*) filter (where external_id ~ '^[A-Z0-9]{17}-[A-Z0-9]{17}$')
                                                                       as wealthcharts_shaped,
       count(*) filter (where external_id like 'auto-%')               as auto_generated,
       count(*) filter (where external_id is null)                     as no_id
  from public.trades
 where account like 'APEX%';


-- 4. One account, in full, oldest first.
--    1672 should come to 3,288.00 once this is fixed. Whatever it comes to now,
--    the rows that should not be there are somewhere in this list.

select opened_at, closed_at, symbol, direction, contracts, net_pnl, external_id
  from public.trades
 where account = 'APEX-26922-1672'
 order by opened_at;
