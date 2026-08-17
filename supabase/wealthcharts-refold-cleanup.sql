-- ===========================================================================
-- Remove the trades the WealthCharts fold invented
--
-- Run in the Supabase SQL editor, THEN re-import the exports. Safe to re-run:
-- a second run matches nothing.
--
-- WHAT THESE ROWS ARE
--
-- foldFills bucketed WealthCharts fills on account plus created_on and took
-- the FIRST open and the FIRST close in each bucket. That is right while a
-- bucket holds one round turn, and 36 of them held two - two trades filled in
-- the same second. Each of those emitted one trade pairing an open with the
-- WRONG close, and discarded the other pair in silence.
--
-- The discarded closes were worth -8,507.34 across nineteen accounts. Losses
-- that never arrive do not look like missing data; they look like a better
-- month, which is why nothing complained.
--
-- The importer now pairs every round turn in a bucket, so re-importing brings
-- in what was missing. It cannot remove what was wrong: those rows carry an
-- external_id the fixed fold never produces, so the upsert has nothing to
-- overwrite and they would sit there for ever. Hence this file.
--
-- Deleting is by external_id and touches nothing else. Any trade you hand
-- edited is untouched unless it is one of these, and these were never real.
-- ===========================================================================

-- Rows the old fold invented, and the fixed one does not produce.
-- Safe to run more than once: a second run deletes nothing.
delete from public.trades
 where external_id in (
  '41IU4IYJWMSQ9NN42-41IV90NQHMSQ9FVDW',
  '5CXU4IYJWMSQ9NN3W-5CXV90NQHMSQ9FVE2',
  '6C8U4IYJWMSQ9NN1O-6C8V90NQHMSQ9FVAZ',
  'B8AU4IYJWMSQ9NN45-B8AV90NQHMSQ9FVDQ',
  'EL8U4IYJWMSQ9NN2P-EL8V90NQHMSQ9FVCE',
  'GHSU4IYJWMSQ9NN1I-GHSV90NQHMSQ9FVB5',
  'IJZU4IYJWMSQ9NN1U-IJZV90NQHMSQ9FVB2',
  'KJWU4IYJWMSQ9NN31-KJWV90NQHMSQ9FVCN',
  'M9XU4IYJWMSQ9NN3T-M9XV90NQHMSQ9FVDT',
  'O4XU4IYJWMSQ9NN3Z-O4XV90NQHMSQ9FVDZ',
  'QGVU4IYJWMSQ9NN2M-QGVV90NQHMSQ9FVCH',
  'QHEU4IYJWMSQ9NN1R-QHEV90NQHMSQ9FVB8',
  'SETU4IYJWMSQ9NN4B-SETV90NQHMSQ9FVE9',
  'SYWU4IYJWMSQ9NN1L-SYWV90NQHMSQ9FVBE',
  'UMRU4IYJWMSQ9NN1X-UMRV90NQHMSQ9FVBB',
  'VOJU4IYJWMSQ9NN2Y-VOJV90NQHMSQ9FVCQ',
  'WJCU4IYJWMSQ9NN2S-WJCV90NQHMSQ9FVCK',
  'YP7U4IYJWMSQ9NN2V-YP7V90NQHMSQ9FVCT'
 );

-- Expect 18 rows deleted. Then re-import every export file.
--
-- Afterwards, per account, the journal should agree with WealthCharts'
-- Realized PnL to the cent. Across all nineteen the total is 61,302.50 -
-- against 69,809.84 before, which is the 8,507.34 of missing losses.
