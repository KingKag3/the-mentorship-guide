-- ===========================================================================
-- Fix: the import upsert could not match its own index
--
-- Run in the Supabase SQL editor after trade-import.sql. Safe to re-run.
--
-- trade-import.sql created trades_external_idx as a *partial* index, carrying
-- "where external_id is not null". Postgres will only resolve an ON CONFLICT
-- clause against a partial index if the clause repeats that predicate, and
-- PostgREST's on_conflict parameter has no way to express one. So every import
-- failed with:
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- The predicate was never necessary. A unique index treats nulls as distinct
-- from one another by default, so any number of hand-entered rows can hold a
-- null external_id without colliding. Dropping the predicate costs nothing and
-- makes the index addressable.
--
-- Uniqueness is still per user, not global: two members can hold the same fill
-- id, which happens as soon as two of them export from the same copied account.
-- ===========================================================================


drop index if exists public.trades_external_idx;

create unique index if not exists trades_external_idx
  on public.trades (user_id, external_id);


-- Rows imported before this ran are matched on the same pair, so re-importing
-- the same file now updates them rather than duplicating them.
