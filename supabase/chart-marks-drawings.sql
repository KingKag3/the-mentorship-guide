-- ===========================================================================
-- Drawings on the chart: callouts, arrows and boxes
--
-- Run in the Supabase SQL editor after chart-marks.sql. Idempotent, safe to
-- re-run. SUPERSEDES chart-marks-shapes.sql - everything that file did is
-- repeated here, so whether or not it was run, this is the only one to run.
-- Existing marks keep working and read as `kind = 'pin'`.
--
--
-- WHAT CHANGED, AND WHY THE DATA STAYS IN TIME AND PRICE
--
-- The drawings are now edited with Konva, a canvas library that provides the
-- grab-handles - move, resize - that are expensive to write by hand and are
-- the difference between "a box made with a prompt" and something that feels
-- like drawing on a chart. See DECISIONS 2026-09-21.
--
-- Konva works in pixels. These rows deliberately do not. A callout stored as
-- "400 pixels in, 120 down" points at the right candle only until the chart is
-- cropped, zoomed, or opened on a different-sized screen - and the chart does
-- all three. So every point is an instant and a price, and the page converts
-- to pixels on the way into the editor and back on the way out. Konva never
-- sees a stored coordinate it could get wrong.
--
--
-- THE KINDS, AND WHAT THEIR TWO POINTS MEAN
--
--   pin      one point, words required.            (the original mark)
--   box      two corners.                          words optional
--   line     start and end.                        words optional
--   arrow    tail, then head - the head is at_end. words optional
--   callout  the point it indicates (at, price),
--            then where the bubble sits (at_end, price_end).
--            words are the point of it, but allowed empty while being made
--
-- `style` carries what is not geometry - colour, today - as JSON rather than a
-- column per property, because the palette will grow and a migration per new
-- attribute of a drawing is out of proportion to what it stores.
-- ===========================================================================


alter table public.chart_marks add column if not exists kind      text not null default 'pin';
alter table public.chart_marks add column if not exists at_end    timestamptz;
alter table public.chart_marks add column if not exists price_end numeric;
alter table public.chart_marks add column if not exists style     jsonb;

alter table public.chart_marks drop constraint if exists chart_marks_kind_check;
alter table public.chart_marks
  add constraint chart_marks_kind_check
  check (kind in ('pin', 'box', 'line', 'arrow', 'callout'));

/* Two-point drawings have both points, or they are not drawings.
 *
 * A callout with no bubble position or an arrow with no head stores happily and
 * draws as nothing - a thing the member made that the chart then silently
 * declines to show. Refusing the write is the kinder failure: it happens at the
 * moment something is wrong, in front of the person who can fix it. */
alter table public.chart_marks drop constraint if exists chart_marks_shape_check;
alter table public.chart_marks
  add constraint chart_marks_shape_check
  check (
    (kind = 'pin' and at_end is null and price_end is null)
    or
    (kind <> 'pin' and at_end is not null and price_end is not null)
  );

/* Words: required on a pin, optional on everything else.
 *
 * A pin is a dot until it has words. A box or an arrow says something by
 * existing, and a callout is empty for the moment between being dropped on the
 * chart and being typed into - refusing that write would lose the drawing the
 * instant it was made. */
alter table public.chart_marks drop constraint if exists chart_marks_body_check;
alter table public.chart_marks alter column body drop not null;

alter table public.chart_marks
  add constraint chart_marks_body_check
  check (
    (kind = 'pin' and body is not null and length(btrim(body)) between 1 and 2000)
    or
    (kind <> 'pin' and (body is null or length(body) <= 2000))
  );

/* style is a small object, not a document. Bounded so a bug in the editor
 * that writes something enormous fails loudly instead of becoming part of
 * every calendar load. */
alter table public.chart_marks drop constraint if exists chart_marks_style_check;
alter table public.chart_marks
  add constraint chart_marks_style_check
  check (style is null or (jsonb_typeof(style) = 'object' and length(style::text) <= 2000));

comment on column public.chart_marks.kind is
  'pin, box, line, arrow or callout. See chart-marks-drawings.sql for what the '
  'two points mean for each.';
comment on column public.chart_marks.at_end is
  'The second point''s instant: a box''s far corner, an arrow''s head, where a '
  'callout''s bubble sits. Null only on a pin.';
comment on column public.chart_marks.style is
  'Non-geometric properties of a drawing, such as colour. Never coordinates - '
  'those are always an instant and a price, so a drawing survives a zoom.';


-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
--
--   select kind, count(*) from public.chart_marks group by kind;
--
-- Everything already stored reads as `pin` or `box`.
--
-- A half-made drawing is refused, and refused is the point:
--
--   insert into public.chart_marks (symbol, at, price, kind)
--   values ('NQ', now(), 29000, 'arrow');
--
--   ERROR:  ... violates check constraint "chart_marks_shape_check"
-- ---------------------------------------------------------------------------
