-- ===========================================================================
-- Did curriculum-arrays.sql actually land?
--
-- Run this on its own in the Supabase SQL editor. It changes nothing.
--
-- Phase 2 appearing with no entries under it has three possible causes and
-- they need different fixes, so it is worth one query to tell them apart:
--
--   the rows are not there       the inserts never ran - most likely only part
--                                of the file executed, or an error stopped it
--                                partway and scrolled out of view
--   the rows are there, orphaned phase_id came back null, so they belong to no
--                                phase and appear nowhere
--   the rows are there, hidden   published is false, so the policy excludes them
--
-- The repair at the bottom is commented out. Read the counts first.
-- ===========================================================================

with wanted(slug) as (
  values ('order-block-validity'),
         ('inversions'),
         ('volume-imbalance-and-balanced-range'),
         ('the-gap-that-does-not-fill'),
         ('internal-and-external-liquidity'),
         ('opening-prices'),
         ('market-maker-model-phases')
)
select
  (select count(*) from public.phases  where slug = 'phase-2')            as phase_2_exists,
  (select id       from public.phases  where slug = 'phase-2')            as phase_2_id,
  (select count(*) from public.lessons l join wanted w on w.slug = l.slug) as of_seven_present,
  (select count(*) from public.lessons l join wanted w on w.slug = l.slug
     where l.phase_id is null)                                            as orphaned,
  (select count(*) from public.lessons l join wanted w on w.slug = l.slug
     where l.published is not true)                                       as unpublished,
  (select count(*) from public.lessons
     where phase_id = (select id from public.phases where slug = 'phase-2')
       and published)                                                     as visible_in_phase_2;


-- ---------------------------------------------------------------------------
-- Repair, if the rows are present but orphaned or hidden.
--
-- Only touches the seven slugs this file names, so nothing you have written
-- yourself can be caught by it. Uncomment and run.
-- ---------------------------------------------------------------------------

-- update public.lessons
--    set phase_id  = (select id from public.phases where slug = 'phase-2'),
--        published = true
--  where slug in ('order-block-validity',
--                 'inversions',
--                 'volume-imbalance-and-balanced-range',
--                 'the-gap-that-does-not-fill',
--                 'internal-and-external-liquidity',
--                 'opening-prices',
--                 'market-maker-model-phases');


-- ---------------------------------------------------------------------------
-- If of_seven_present is 0, the inserts never ran. Re-run
-- curriculum-arrays.sql in full rather than repairing anything.
--
-- Worth knowing about the SQL editor: it runs the whole buffer, but if any text
-- is SELECTED it runs only the selection. A stray click-and-drag before hitting
-- Run is the usual reason a long file half-applies.
-- ---------------------------------------------------------------------------
