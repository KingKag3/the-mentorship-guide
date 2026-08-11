-- ---------------------------------------------------------------------------
-- When the trade closed
--
-- Run this in the Supabase SQL editor. Idempotent, safe to re-run.
--
-- `trades` records when a trade opened and never recorded when it ended, so the
-- journal knew how a trade turned out and not how long it took. That rules out
-- the single most revealing comparison a journal can make:
--
--     the median time a winner is held, against the median time a loser is
--
-- If winners are cut in four minutes and losers nursed for forty, that is the
-- disposition effect - taking profits early to feel right, holding losses to
-- avoid being wrong - and it is expensive, extremely common, and invisible to
-- anyone who has not measured it. It is also the kind of thing a member cannot
-- see by scrolling their own fills.
--
-- The data was already arriving. A Tradovate Performance export carries both
-- fill timestamps; the importer read the earlier one to get an open time and
-- discarded the later one. This adds the column and the importer now keeps it.
--
-- Nothing backfills. Existing rows keep a null closed_at and are simply left
-- out of duration figures rather than counted as instant - re-importing the
-- same file fills them in, because the upsert matches on external_id.
-- ---------------------------------------------------------------------------

alter table public.trades
  add column if not exists closed_at timestamptz;

comment on column public.trades.closed_at is
  'When the position was flat again. Null when unknown; never inferred.';

-- Duration questions are asked per member over a date range, which is the same
-- shape the existing user/opened_at index serves.
create index if not exists trades_user_closed_idx
  on public.trades (user_id, closed_at);


-- ---------------------------------------------------------------------------
-- Check. After re-importing, expect closed_at populated and always at or after
-- opened_at. A row where it is earlier means the importer picked the wrong
-- fill, which on a short would be easy to do and hard to notice.
-- ---------------------------------------------------------------------------
--
--   select count(*) filter (where closed_at is null)     as no_close,
--          count(*) filter (where closed_at < opened_at) as backwards,
--          count(*)                                      as total
--     from public.trades;
-- ---------------------------------------------------------------------------
