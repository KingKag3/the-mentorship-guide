-- ===========================================================================
-- Curriculum: arrays, imbalance and the opening prices
--
-- Run in the Supabase SQL editor after phases.sql. Safe to re-run.
--
-- Adds one phase and seven entries. Distilled from a course document ingested
-- on 10 August 2026, cross-checked against the two source books, and written
-- from scratch — no wording is carried over from any source.
--
-- Every insert is "on conflict (slug) do nothing", so re-running this will not
-- overwrite an entry you have since edited in the admin page. If you want a
-- body replaced, delete that row first and run it again.
--
-- These seven were chosen because they are the parts the public concept pages
-- do not already teach. Market structure, premium and discount, and low versus
-- high resistance liquidity runs are all in the source document too, and all
-- three are already covered on the site — repeating them behind a login would
-- add a click and no knowledge.
-- ===========================================================================


insert into public.phases (slug, title, subtitle, sort_order)
values ('phase-2', 'Phase 2', 'Arrays, imbalance and the opening prices', 2)
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- 1. Order block validity
-- ---------------------------------------------------------------------------

insert into public.lessons (slug, title, summary, body_html, phase_id, sort_order)
values (
  'order-block-validity',
  'When an order block is actually valid',
  'Four checks that turn "the last down candle before a move up" into something you can be wrong about.',
  $html$
<p>The usual definition of an order block is easy to say and almost useless on its own: the last
down-closing candle before a sharp move up, or the last up-closing candle before a sharp move down.
Applied literally that describes several candles on every chart, most days. The definition is not
wrong, it is just badly under-specified.</p>

<p>Four checks narrow it. Read them as things that accumulate rather than as a pass or fail list —
a block that satisfies all four is a different proposition from one that satisfies two.</p>

<ol>
  <li><strong>It took something.</strong> The move away from the block ran a level that mattered —
  the previous higher-timeframe candle's high or low — or the block sits at an opening price you
  were already watching.</li>
  <li><strong>Structure broke after it.</strong> The move it caused was large enough to change the
  read on the chart, not merely large enough to notice.</li>
  <li><strong>The imbalance is at least twice the block.</strong> Measure the block. Measure the
  inefficiency the move left behind. If the second is not double the first, the reaction was not
  proportionate to the thing you are claiming caused it.</li>
  <li><strong>It consumed an opposing block.</strong> The move through the other side's zone is
  what makes the level interesting rather than merely present.</li>
</ol>

<p>The third check is the one worth building a habit around, because it is the only one of the four
that is a number. Everything else in this material is calibrated against the size of the day — how
many points is a big move on this instrument, this year — and that calibration goes stale as the
instrument moves and as volatility changes. A ratio does not. Twice the block is twice the block on
NQ at 29,000 and on ES at 6,400, this year and in five years.</p>

<p>It also asks a sharper question than "was that a big move". It asks whether the move was big
<em>relative to the thing you are saying caused it</em>. A small block that produced an enormous
displacement is a strong claim. A large block that produced a move barely its own size is a candle
you have drawn a box around.</p>

<p><strong>Where this comes from and what it replaces.</strong> The source books say context is
required and then decline to say what context is. These four are the most specific answer anything
has offered. They are not a rule handed down from the market; they are a filter, and the honest
description is that they reduce how often you are allowed to call something an order block.</p>
$html$,
  (select id from public.phases where slug = 'phase-2'),
  1
)
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- 2. Inversions
-- ---------------------------------------------------------------------------

insert into public.lessons (slug, title, summary, body_html, phase_id, sort_order)
values (
  'inversions',
  'When a gap flips',
  'A fair value gap that failed does not stop existing. It changes sides.',
  $html$
<p>A fair value gap is an inefficiency, and the working assumption is that price returns to it. Most
of the time it does, price reacts, and the gap has done its job.</p>

<p>Sometimes price goes straight through and closes beyond it. The usual reading is that the gap is
now spent and can be ignored. The more useful reading is that it changed polarity: a bullish gap
that failed to hold becomes a level that resists from above, and a bearish gap that failed becomes
one that supports from below.</p>

<p><strong>The failure is the mechanical part, not the reaction.</strong> You are not guessing that
a level will flip — you are waiting for it to have already failed, which is an event with a
definition. Price closed through the gap. That either happened or it did not.</p>

<p>What follows is the ordinary business of any level: price comes back to it and either respects it
or does not. The flip does not make the level strong. It makes it a level with a known history,
which is more than most levels on a chart have.</p>

<p><strong>Why this matters more than it sounds.</strong> Without it, a failed gap is just a
mistake — you marked a zone, price ignored it, you delete the drawing. With it, the same failure
tells you something: whoever was defending that gap has been overrun, and the price they were
defending is now the price they may be trapped at.</p>

<p>The pairing with the previous entry is worth noticing. A block that failed and flipped is a
breaker. A gap that failed and flipped is an inversion. Same idea, different array, and both depend
on somebody being wrong at a price you can point to.</p>
$html$,
  (select id from public.phases where slug = 'phase-2'),
  2
)
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- 3. Volume imbalance and the balanced price range
-- ---------------------------------------------------------------------------

insert into public.lessons (slug, title, summary, body_html, phase_id, sort_order)
values (
  'volume-imbalance-and-balanced-range',
  'Two smaller inefficiencies',
  'A gap between two candle bodies, and the zone where two opposing gaps cancel each other out.',
  $html$
<p>The three-candle fair value gap is the one everything is built on, but it is not the only kind of
inefficiency worth marking.</p>

<h3>Volume imbalance</h3>

<p>Two consecutive candles whose <em>bodies</em> do not touch, even though their wicks may overlap.
Trade happened in the space between the bodies, but not much of it, and the market often comes back
through to fill in what it skipped.</p>

<p>Note what makes this different from a fair value gap: it is two candles rather than three, and it
is measured on bodies rather than wicks. Those are different objects with different definitions, and
conflating them is the usual mistake.</p>

<p>Be honest about the scale. On a five-minute index chart these are everywhere and most of them
mean nothing. They are worth more as an explanation of why price stalled somewhere odd than as a
reason to take a trade.</p>

<h3>Balanced price range</h3>

<p>Two fair value gaps pointing opposite ways, formed close together, overlapping each other. The
overlap is the zone.</p>

<p>The logic is subtraction. The first displacement left an inefficiency; the second displacement,
going the other way, filled it. The region has now been traded in both directions, which is the
definition of efficient. Nobody is left unserved there.</p>

<p><strong>Which makes it the opposite of the other arrays here.</strong> An unfilled gap is a
reason for price to return. A balanced range is a region price has no unfinished business with, so
the default expectation is that it passes through rather than reacts.</p>

<p>That is genuinely useful in the negative case — it explains why a level that looked significant
did nothing. It is also the reason some traders treat these zones as reversal areas instead, on the
grounds that a doubly-worked region is where a decision got made. Both readings are in circulation.
Neither has been tested here, and you should treat this entry as vocabulary rather than as a
method.</p>
$html$,
  (select id from public.phases where slug = 'phase-2'),
  3
)
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- 4. The breakaway gap, and the disagreement it exposes
-- ---------------------------------------------------------------------------

insert into public.lessons (slug, title, summary, body_html, phase_id, sort_order)
values (
  'the-gap-that-does-not-fill',
  'The gap that is not supposed to fill',
  'One source says every inefficiency gets rebalanced. Another carves out an exception. Both cannot be applied.',
  $html$
<p>Everything else in this material rests on one premise: an inefficiency is unfinished business, and
price comes back for it. That premise is what makes a fair value gap an entry rather than a
decoration.</p>

<p>A breakaway gap is the stated exception. When price leaves a consolidation decisively, the gap it
leaves at the edge of that range is expected to stay open — not for a while, but for a long time,
because the move away was a change of mind rather than an overshoot.</p>

<p><strong>These two claims contradict each other, and this entry is not going to resolve it.</strong>
That is the point of including it.</p>

<p>The distinguishing mark usually offered is volume: a breakaway gap comes with a lot of it. That
does not survive contact with futures. Volume on a futures contract is per-contract and per-venue,
so the same candle carries different volume depending on which contract month you are looking at and
which feed you are looking through. A threshold set on one is meaningless on another.</p>

<p>What is left is context, which is a judgement: is this gap in the middle of a leg, or at the edge
of a range price has just abandoned? That is a real distinction and you can often see it. It is not
a test, and you should not pretend it is one.</p>

<h3>How to hold both</h3>

<p>Until something can tell the two apart in advance, treat every gap as fillable. That is the
assumption that costs least when it is wrong. Being wrong about a breakaway gap means a target you
never reach — annoying, survivable, and visible in your journal. Being wrong the other way means
declining every ordinary gap because it might be the exception, which removes the setup entirely.</p>

<p><strong>The wider lesson is about sources.</strong> When two credible sources disagree, the useful
response is not to pick the one you like. It is to work out what would settle it, notice that nothing
you have settles it, and write down which assumption you are running on and why. That note is worth
more later than the answer would have been.</p>
$html$,
  (select id from public.phases where slug = 'phase-2'),
  4
)
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- 5. Internal and external range liquidity
-- ---------------------------------------------------------------------------

insert into public.lessons (slug, title, summary, body_html, phase_id, sort_order)
values (
  'internal-and-external-liquidity',
  'Two places price can be going',
  'Reframing "where is price drawn" as a question with only two answers.',
  $html$
<p>Draw on liquidity is the right idea and a hard question to act on, because "where is price going"
has as many answers as you have levels drawn.</p>

<p>Splitting it in two makes it answerable:</p>

<ul>
  <li><strong>Internal range liquidity</strong> — the unfilled gaps <em>inside</em> the range price
  is currently in. Price goes there to rebalance.</li>
  <li><strong>External range liquidity</strong> — the old highs and lows <em>outside</em> it. Price
  goes there to take stops.</li>
</ul>

<p>Every destination is one or the other. So instead of picking a level, you pick a category, and
the level follows: if the answer is internal, the target is the nearest unfilled gap between here
and the edge; if external, it is the high or low beyond it.</p>

<p><strong>The sequence matters.</strong> The common pattern is that price satisfies the internal
business first and then goes for the external — filling the gap on the way to running the high.
Which means an internal target reached is not the end of the move, and treating it as one is a
recognisable way to leave most of a trade on the table.</p>

<p>It also sharpens what you are looking at while you wait. If price is stalling and there is an
unfilled gap behind it, the stall has an explanation. If there is nothing internal left, the stall
is something else.</p>

<p><strong>A caution about hindsight.</strong> Both categories are trivially identifiable after the
fact, and both are genuinely useful in advance — but only if you write down which one you expected
<em>before</em> the move. The distinction is easy to use as a post-hoc explanation for anything that
happened, which teaches you nothing at all. The journal is what stops that.</p>
$html$,
  (select id from public.phases where slug = 'phase-2'),
  5
)
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- 6. Opening prices above the daily
-- ---------------------------------------------------------------------------

insert into public.lessons (slug, title, summary, body_html, phase_id, sort_order)
values (
  'opening-prices',
  'Opening prices above the daily',
  'Midnight is not the only open worth marking, and each one is read on its own timeframe.',
  $html$
<p>The New York midnight open is already the reference for the day: above it, the day leans one way;
below it, the other. It is crude, it is free, and it is on the chart before anything else happens.</p>

<p>The same reasoning scales up. The first trade of a period is a reference for that period.</p>

<table>
  <tr><th>Open</th><th>When</th></tr>
  <tr><td>Midnight</td><td>00:00 New York</td></tr>
  <tr><td>Weekly</td><td>The week's first trade, Sunday evening</td></tr>
  <tr><td>Monthly</td><td>The month's first trade</td></tr>
  <tr><td>Quarterly</td><td>The first trade of January, April, July and October</td></tr>
</table>

<p>None of that is surprising. The part that is actually new is that each open is meant to be read
on a specific timeframe rather than on whatever chart you happen to have open:</p>

<table>
  <tr><th>Open</th><th>Read it on</th></tr>
  <tr><td>Monthly</td><td>Daily</td></tr>
  <tr><td>Quarterly</td><td>Weekly</td></tr>
  <tr><td>Weekly</td><td>4-hour or 1-hour</td></tr>
  <tr><td>Midnight</td><td>1-hour or 15-minute</td></tr>
</table>

<p>Roughly two steps down from the period itself. The reason is practical rather than mystical: on
too high a timeframe the reaction to the open is inside a single candle and invisible; on too low a
one it is buried in noise and you will find a reaction to anything.</p>

<h3>What you are waiting for</h3>

<p>The sequence is the one you already know, with an opening price standing in for the swept
level. When the bias is bullish, price reaches for a discount below the open, then displaces back
above it. The candle that turned it is your order block candidate — and it now satisfies the first
of the four validity checks, because it happened at a level you were already watching.</p>

<p>That is worth saying plainly: <strong>this is not a new setup.</strong> It is the same setup with
a different origin. If you find yourself learning it as a separate pattern, you have learned it
wrong.</p>
$html$,
  (select id from public.phases where slug = 'phase-2'),
  6
)
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- 7. The market maker model
-- ---------------------------------------------------------------------------

insert into public.lessons (slug, title, summary, body_html, phase_id, sort_order)
values (
  'market-maker-model-phases',
  'The five phases, and why they are hard to use',
  'A whole-session shape with named parts — and an honest account of what makes it a hindsight trap.',
  $html$
<p>Most of this material describes moments: a sweep, a displacement, a gap. The market maker model
describes a whole session, in five named phases. Buy model first; the sell model is the mirror.</p>

<ol>
  <li><strong>Original consolidation.</strong> Range-bound trade that builds up the stops the rest of
  the model will eventually take.</li>
  <li><strong>Distribution.</strong> Price leaves the range downward. Sellers join, expecting more of
  the same.</li>
  <li><strong>Smart money reversal.</strong> A significant low forms at a higher-timeframe discount,
  and structure shifts. This is the turn.</li>
  <li><strong>Accumulation.</strong> The first and second legs up. This is where the model says
  entries live.</li>
  <li><strong>Terminus.</strong> Price trades above the original consolidation's highs, taking the
  buy stops that were built in phase one. <em>The model is finished here, not starting.</em></li>
</ol>

<p>Phase five is the one people get backwards. The move through the old highs looks like a breakout
and is, in this framing, the end of the sequence — the stops it takes are the ones phase one existed
to create.</p>

<h3>The problem you should know about before you use it</h3>

<p>Phase three requires a higher-timeframe discount array. Nothing in this material defines that
mechanically. It is the single largest hole in the whole framework, and it is the reason the
reversal logic in our own indicator is switched off by default.</p>

<p>Without that definition, <strong>phases two and three cannot be told apart while they are
happening.</strong> A move down is distribution if it continues and a smart money reversal if it
turns, and you find out which afterwards. The model then reads perfectly on every historical chart
and gives you nothing in real time — which is precisely the property that makes a framework feel
profound and pay nothing.</p>

<p>So use it as a map of where you probably are, not as a signal. Label the phase you think you are
in, in advance, in your journal. Then check. A framework you can be wrong about in writing is worth
more than one that is always right in review.</p>
$html$,
  (select id from public.phases where slug = 'phase-2'),
  7
)
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- What was deliberately not added
--
-- Market structure, premium and discount, low versus high resistance liquidity
-- runs, and SMT divergence are all in the source document and all already on
-- the public concept pages. Adding them here would mean two versions of the
-- same explanation drifting apart, which is worse than one.
--
-- The source document's own trading model is a page reading "coming soon", so
-- there is nothing to distil. If a later version publishes it, that becomes its
-- own entry rather than an edit to any of these.
-- ---------------------------------------------------------------------------
