-- ===========================================================================
-- Six accounts nobody recognises
--
-- APEX-247230-10 to -13 and APEX-28074-08/-09, 122 trades, -2,866.12 between
-- them. They are in the journal and they are not in any export on disk: every
-- WealthCharts file in Downloads carries APEX-26922-16xx and nothing else.
--
-- Section 1 is a SELECT and identifies where they came from. Read it before
-- running anything else - section 2 deletes, and a delete cascades.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. What are they, and where did they come from
--
-- `id_shape` is the tell:
--
--   wealthcharts   two 17-character order ids joined by a hyphen. They came
--                  from a WealthCharts export that is no longer on disk, and
--                  they carry the same fold fault everything else did - so the
--                  figures are wrong, not just unexplained.
--   generated      no id in the file, so the importer made a fingerprint. A
--                  broker export without an id column, or the mock fixture.
--   hand           typed into the journal rather than imported.
--   other          something else, and worth pasting back rather than guessing.
--
-- `has_reply`, `shared` and `has_notes` are the columns that would hurt to
-- lose. If any is true, do not run section 2 without saying so first.
-- ---------------------------------------------------------------------------

select t.account,
       count(*)                                        as trades,
       round(sum(t.net_pnl), 2)                        as total,
       min(t.opened_at)::date                          as first_day,
       max(t.opened_at)::date                          as last_day,
       count(distinct t.symbol)                        as symbols,
       min(t.symbol)                                   as a_symbol,
       case
         when bool_and(t.external_id ~ '^[A-Z0-9]{17}-[A-Z0-9]{17}$') then 'wealthcharts'
         when bool_and(t.external_id is null)                         then 'hand'
         when bool_and(t.external_id ~ '^[0-9a-z]{4,12}$')            then 'generated'
         else 'other'
       end                                             as id_shape,
       min(t.external_id)                              as an_example_id,
       count(*) filter (where t.shared_with_mentor)    as shared,
       count(*) filter (where t.notes is not null and btrim(t.notes) <> '') as has_notes,
       count(*) filter (where exists (select 1 from public.trade_reviews r
                                       where r.trade_id = t.id))      as has_reply,
       min(t.created_at)::date                         as imported_on
  from public.trades t
 where t.account in ('APEX-247230-10', 'APEX-247230-11', 'APEX-247230-12',
                     'APEX-247230-13', 'APEX-28074-08', 'APEX-28074-09')
 group by t.account
 order by t.account;


-- ---------------------------------------------------------------------------
-- 2. Remove them, ONLY once section 1 has been read
--
-- Uncomment to run. Deleting a trade cascades to its mentor replies, which is
-- why this is commented out rather than ready to press: nothing here is urgent,
-- and a row that has been sitting there for a week can wait for one look.
--
-- `imported_on` in section 1 dates them. If it matches the day the mock fixture
-- was loaded - see HANDOVER.md, the seventh session - they are test data and
-- this is safe. If it matches a day real trading was imported, they are a real
-- account under a name that has been forgotten, and deleting is the wrong move.
-- ---------------------------------------------------------------------------

-- delete from public.trades
--  where account in ('APEX-247230-10', 'APEX-247230-11', 'APEX-247230-12',
--                    'APEX-247230-13', 'APEX-28074-08', 'APEX-28074-09');


-- ---------------------------------------------------------------------------
-- 3. Anything else that is not one of the nineteen
--
-- The same question asked the other way round, in case there is more than
-- these six.
-- ---------------------------------------------------------------------------

select account, count(*) as trades, round(sum(net_pnl), 2) as total,
       min(opened_at)::date as first_day, max(opened_at)::date as last_day
  from public.trades
 where account is null
    or account not between 'APEX-26922-1672' and 'APEX-26922-1690'
 group by account
 order by account;
