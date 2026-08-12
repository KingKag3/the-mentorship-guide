-- ---------------------------------------------------------------------------
-- A link to the chart, instead of a file
--
-- Run this in the Supabase SQL editor. Idempotent, safe to re-run.
--
-- Trades already carry `screenshot_path`: an image the member saved, found,
-- and uploaded, which then lives in a private bucket behind signed URLs. Three
-- steps and a storage policy, to show a picture of a chart they were already
-- looking at.
--
-- TradingView will do all of it for nothing. Alt+S on a chart produces a link
-- of the shape
--
--     https://www.tradingview.com/x/m7azfyek/
--
-- and the image behind it sits at a URL derived from the id - first character
-- as the folder - so the page can render the chart inline from the link alone:
--
--     https://s3.tradingview.com/snapshots/m/m7azfyek.png
--
-- One keystroke, one paste, no upload, no bucket, no signed URL, and nothing
-- of the member's stored anywhere it could leak. The column is deliberately a
-- plain text link rather than a TradingView id: somebody hosting a chart
-- elsewhere should not be told their screenshot is the wrong brand.
--
-- `screenshot_path` stays. Uploads still work and old rows keep theirs; the
-- link is simply the easier road for anybody who has not taken one yet.
-- ---------------------------------------------------------------------------

alter table public.trades
  add column if not exists chart_url text;

comment on column public.trades.chart_url is
  'Link to a chart image for this trade - usually a TradingView snapshot from '
  'Alt+S. Rendered inline when the host is recognised, otherwise shown as a '
  'link. No file is stored for this; see screenshot_path for uploads.';


-- ---------------------------------------------------------------------------
-- Check. Expect the new column to exist and every row to be null until
-- somebody pastes one.
-- ---------------------------------------------------------------------------
--
--   select count(*)                                  as total,
--          count(chart_url)                          as with_link,
--          count(screenshot_path)                    as with_upload
--     from public.trades;
-- ---------------------------------------------------------------------------
