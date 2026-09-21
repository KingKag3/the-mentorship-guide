-- ===========================================================================
-- SUPERSEDED on 21 September 2026 by chart-marks-drawings.sql, which repeats
-- everything here and adds arrows, callouts and a style column. Run THAT one.
-- Running this as well is harmless - both are idempotent - but unnecessary.
-- ===========================================================================
--
-- A mark can be a shape, not only a point
--
-- Run in the Supabase SQL editor after chart-marks.sql. Idempotent, safe to
-- re-run. Existing marks keep working and become `kind = 'pin'`.
--
--
-- WHY THE FIRST VERSION WAS NOT ENOUGH
--
-- `chart_marks` held one instant and one price: a pin, with words attached.
-- What was actually wanted is the thing a trader draws on a chart - a BOX round
-- the move, the range, the bit where it went wrong. "I did this here" is an
-- area, and an area needs two corners.
--
-- A pin cannot fake it. Putting a pin at the top-left of what somebody meant
-- and hoping the words carry the rest is the page deciding that a shape is not
-- worth storing, which is exactly the decision the member disagreed with.
--
--
-- THE SHAPE IS TWO POINTS AND A KIND
--
--   pin   one instant, one price, words required. What existed before.
--   box   two corners. A region of time and price.
--   line  two points, drawn as a line. A level held, or a slope.
--
-- `at_end` and `price_end` are null for a pin and required for the rest, which
-- the check below enforces rather than trusting the page.
--
--
-- WORDS ARE OPTIONAL ON A SHAPE, AND REQUIRED ON A PIN
--
-- A box round the reversal says something by existing. A pin is nothing but a
-- dot until it has words, so it keeps the old rule.
-- ===========================================================================


alter table public.chart_marks add column if not exists kind      text not null default 'pin';
alter table public.chart_marks add column if not exists at_end    timestamptz;
alter table public.chart_marks add column if not exists price_end numeric;

alter table public.chart_marks drop constraint if exists chart_marks_kind_check;
alter table public.chart_marks
  add constraint chart_marks_kind_check
  check (kind in ('pin', 'box', 'line'));

/* A shape has both ends or it is not a shape.
 *
 * Without this a box with a null second corner is stored happily and draws as
 * nothing - a mark the member made, which the chart then silently declines to
 * show. Refusing the write is the kinder failure: it happens at the moment
 * something is wrong, in front of the person who can fix it. */
alter table public.chart_marks drop constraint if exists chart_marks_shape_check;
alter table public.chart_marks
  add constraint chart_marks_shape_check
  check (
    (kind = 'pin'  and at_end is null and price_end is null)
    or
    (kind in ('box', 'line') and at_end is not null and price_end is not null)
  );

/* Words: required on a pin, optional on a shape.
 *
 * The old constraint demanded 1 to 2000 characters of everything. A box round
 * the reversal says something by existing, and forcing a label on it means
 * somebody types "box" to get past the prompt - which is worse than no label,
 * because now the chart carries a word that means nothing. */
alter table public.chart_marks drop constraint if exists chart_marks_body_check;
alter table public.chart_marks alter column body drop not null;

alter table public.chart_marks
  add constraint chart_marks_body_check
  check (
    (kind = 'pin' and body is not null and length(btrim(body)) between 1 and 2000)
    or
    (kind <> 'pin' and (body is null or length(btrim(body)) <= 2000))
  );

comment on column public.chart_marks.kind is
  'pin (one point, words required), box or line (two points, words optional).';
comment on column public.chart_marks.at_end is
  'The second corner''s instant. Null on a pin, required on a shape.';


-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
--
--   select kind, count(*) from public.chart_marks group by kind;
--
-- Everything already stored reads as `pin`, because that is what it was.
--
-- The constraints refuse a half-made shape. This should fail, and failing is
-- the point:
--
--   insert into public.chart_marks (symbol, at, price, kind, body)
--   values ('NQ', now(), 29000, 'box', 'no second corner');
--
--   ERROR:  new row ... violates check constraint "chart_marks_shape_check"
-- ---------------------------------------------------------------------------
