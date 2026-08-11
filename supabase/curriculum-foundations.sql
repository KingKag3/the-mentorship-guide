-- ---------------------------------------------------------------------------
-- Prerequisites: the foundations, with diagrams
--
-- The seven lessons already in this section are refinements - order block
-- validity, inversions, the smaller imbalances, internal versus external
-- liquidity, the opening prices, the five phases. Every one of them assumes a
-- reader who already knows what liquidity is and what a gap is.
--
-- These six come first and assume none of it. They are what a student needs
-- before any of the rest of this parses, in the order that builds:
--
--   1  what liquidity actually is        4  premium and discount
--   2  what an imbalance is              5  everything here is New York time
--   3  swing points and structure        6  risk comes first
--
-- Six is arguably in the wrong place - it should be first. It is last because
-- nobody reads a risk lesson until they want to trade, and it says so.
--
-- The existing seven move to 11-17 so the two groups are separate and there is
-- room in between. Numbering in ones is what forced a phase renumber earlier.
--
-- Every figure was rendered in a browser and checked against BOTH themes before
-- this file was generated, and the file is generated from that verified markup
-- rather than retyped. No figure carries a colour literal; they use the svg-*
-- classes so a theme switch changes the ink and nothing else.
--
-- Safe to re-run. ON CONFLICT DO NOTHING, so an edit made in the admin
-- afterwards will not be clobbered by running this again.
-- ---------------------------------------------------------------------------


-- Push the existing seven down, leaving 7-10 free.

update public.lessons set sort_order = 11 where slug = 'order-block-validity';
update public.lessons set sort_order = 12 where slug = 'inversions';
update public.lessons set sort_order = 13 where slug = 'volume-imbalance-and-balanced-range';
update public.lessons set sort_order = 14 where slug = 'the-gap-that-does-not-fill';
update public.lessons set sort_order = 15 where slug = 'internal-and-external-liquidity';
update public.lessons set sort_order = 16 where slug = 'opening-prices';
update public.lessons set sort_order = 17 where slug = 'market-maker-model-phases';


insert into public.lessons (slug, title, summary, body_html, phase_id, sort_order)
values (
  'what-liquidity-is',
  'What liquidity actually is',
  'Why price travels to obvious places, and why a level being taken is the start of the question rather than the end of it.',
  $html$<figure class="figure">
<svg viewBox="0 0 720 320" role="img" aria-label="Two equal highs with stop orders resting above them, price running through the stops and then reversing away">
  <line x1="50" y1="286" x2="670" y2="286" class="svg-axis"/>
  <line x1="90" y1="120" x2="600" y2="120" class="svg-s-mute" stroke-width="1.5" stroke-dasharray="7 5"/>
  <text x="606" y="124" class="svg-label-em">equal highs</text>
  <rect x="90" y="92" width="510" height="28" class="svg-zone-down"/>
  <text x="100" y="86" class="svg-t-down">BUYSIDE LIQUIDITY — stop orders resting above</text>
  <path d="M 100 210 L 150 122 L 200 178 L 250 150 L 300 121 L 350 196" class="svg-neutral" stroke-width="1.7"/>
  <circle cx="150" cy="122" r="4" class="svg-neutral-f"/>
  <circle cx="300" cy="121" r="4" class="svg-neutral-f"/>
  <path d="M 350 196 L 400 160 L 450 104 L 478 96" class="svg-up" stroke-width="2"/>
  <path d="M 478 96 L 510 150 L 560 210 L 620 262" class="svg-down" stroke-width="2"/>
  <circle cx="478" cy="96" r="5" class="svg-down-f"/>
  <text x="418" y="72" class="svg-t-up">runs through</text>
  <text x="500" y="182" class="svg-t-down">and leaves</text>
  <text x="50" y="316" class="svg-label">The orders were the point. Once they are filled, the reason price was travelling that way is gone.</text>
</svg>
<figcaption>Two highs at roughly the same price are not a wall — they are an address. Everyone who
sold there has a stop just above, and a stop on a short is an order to buy.</figcaption>
</figure>
<p>Every order you place is somebody else's opportunity. That is not a turn of phrase. A stop loss
to sell is a market order to sell, sitting in the book, waiting for a price. Anyone who needs to buy
in size cannot do it without sellers, and the places where sellers are queued up are not secret.
They are the obvious ones.</p>

<h3>Two kinds, named backwards on purpose</h3>

<p><strong>Buyside liquidity</strong> sits <em>above</em> a high. Everyone short has a stop up there,
and a stop on a short is a buy. <strong>Sellside liquidity</strong> sits <em>below</em> a low, for
the mirror reason.</p>

<p>This trips up everybody for about a week. It is named for what the orders <em>do</em>, not where
they sit. Above a high is buyside, because the orders there buy.</p>

<h3>Where the clusters are</h3>

<ul>
  <li><strong>Equal highs and equal lows.</strong> Two or more touches at the same price. The
  flatter they are, the stronger — because the more obvious they are, the more orders are there.</li>
  <li><strong>The previous day's high and low</strong>, measured from midnight New York rather than
  from the exchange session.</li>
  <li><strong>The overnight range</strong> — what got built while most participants were asleep.</li>
  <li><strong>Previous week and month extremes.</strong> Slower, and correspondingly heavier.</li>
</ul>

<h3>The mistake almost everyone makes first</h3>

<p>Marking a level and then treating it as a wall. It is the opposite of a wall. Price is going
there <em>because</em> the orders are there, so "surely it will not get through" has it exactly
backwards. Getting through is the point of the trip.</p>

<p>The useful question is never whether a level holds. It is what happens in the minutes
<em>after</em> it is taken. Price runs the stops and keeps going — the level was fuel, the move is
real. Price runs the stops and immediately turns — the run was the objective, and the trip back is
where the trade was.</p>

<p>You cannot know which in advance. What you can do is watch for one of two specific things
instead of hoping for one, and that is most of the difference between reading a chart and staring at
one.</p>

<div class="callout warn">
  <span class="callout-label">Marked is not traded</span>
  <p>A pool on your chart is a note about where orders probably are. It is not a signal, it says
  nothing about when, and drawing more of them does not improve your odds — it just makes the chart
  busier. Three levels you can defend beat fifteen you drew because the tool made it easy.</p>
</div>
$html$,
  (select id from public.phases where slug = 'prerequisites'),
  1
)
on conflict (slug) do nothing;


insert into public.lessons (slug, title, summary, body_html, phase_id, sort_order)
values (
  'what-an-imbalance-is',
  'What an imbalance is',
  'Three candles, one question about the outer two, and the threshold that stops every gap on the chart looking important.',
  $html$<figure class="figure">
<svg viewBox="0 0 720 320" role="img" aria-label="Three candles where the first candle's high sits below the third candle's low, leaving an untraded gap, with its midpoint marked">
  <line x1="50" y1="290" x2="670" y2="290" class="svg-axis"/>
  <line x1="150" y1="196" x2="150" y2="262" class="svg-s-mute" stroke-width="1.5"/>
  <rect x="136" y="210" width="28" height="38" class="svg-f-surface svg-s-mute" stroke-width="1.5"/>
  <text x="126" y="282" class="svg-label">first</text>
  <line x1="260" y1="70" x2="260" y2="240" class="svg-s-up" stroke-width="1.5"/>
  <rect x="246" y="84" width="28" height="140" class="svg-f-up svg-s-up" stroke-width="1.5" opacity="0.42"/>
  <text x="228" y="282" class="svg-label">second</text>
  <line x1="370" y1="96" x2="370" y2="164" class="svg-s-mute" stroke-width="1.5"/>
  <rect x="356" y="112" width="28" height="38" class="svg-f-surface svg-s-mute" stroke-width="1.5"/>
  <text x="352" y="282" class="svg-label">third</text>
  <rect x="150" y="164" width="470" height="32" class="svg-zone-up"/>
  <line x1="150" y1="164" x2="620" y2="164" class="svg-s-up" stroke-width="1.3"/>
  <line x1="150" y1="196" x2="620" y2="196" class="svg-s-up" stroke-width="1.3"/>
  <text x="628" y="168" class="svg-label">third low</text>
  <text x="628" y="200" class="svg-label">first high</text>
  <line x1="150" y1="180" x2="620" y2="180" class="svg-s-ink" stroke-width="1.2" stroke-dasharray="6 4"/>
  <text x="628" y="184" class="svg-label-em">midpoint</text>
  <text x="404" y="146" class="svg-t-up">the gap is what the second candle skipped</text>
  <path d="M 384 120 L 430 100 L 470 148 L 510 180 L 550 132 L 600 88" class="svg-neutral" stroke-width="1.6"/>
  <circle cx="510" cy="180" r="4" class="svg-neutral-f"/>
  <text x="50" y="314" class="svg-label">Nothing traded between the first candle's high and the third candle's low. That band is the imbalance.</text>
</svg>
<figcaption>Three candles, and the test is only about the outer two. The middle candle is the cause,
not the measurement — drawing the gap around it is the usual first mistake.</figcaption>
</figure>
<p>When price moves at a normal pace, both sides get a chance to trade at every price along the way.
When it moves fast enough, they do not. A band of prices gets skipped — nobody bought there, nobody
sold there — and that band is an imbalance.</p>

<h3>The test is only about the outer two candles</h3>

<p>Take any three candles in a row. For an upward imbalance, ask one question: <strong>is the first
candle's high below the third candle's low?</strong> If it is, the prices in between were never
traded, and that is your gap. Downward is the mirror — first candle's low above the third candle's
high.</p>

<p>The middle candle is not part of the measurement. It is the cause, not the thing being measured.
Drawing the gap around the big candle instead of between its neighbours is the usual first
mistake.</p>

<h3>Why mark it</h3>

<p>An untraded band is unfinished business. Price often comes back to trade through it later, and
when it does, that band is a place where a reaction is plausible rather than arbitrary. The
<strong>midpoint</strong> is the level most commonly used, on the reasoning that half of it filling
is enough to call it filled.</p>

<p>Note the hedge in that paragraph. "Often" is not "always". The sources this material is built
from disagree about which gaps are supposed to fill and which are meant to stay open, and that
disagreement gets its own lesson later in this section. It matters more than it sounds, because the
two readings give opposite trades on the same chart.</p>

<h3>Size is what separates a level from a pixel</h3>

<p>Every chart is covered in tiny gaps. On a five-minute chart there will be several an hour and
almost none of them mean anything. What makes one worth marking is its size relative to what the
instrument does in a day — a gap that is a rounding error against the daily range is not a
level.</p>

<p>Pick a threshold and hold yourself to it. Being slightly wrong about the number costs far less
than having no number at all, because without one you will always find a gap that supports the trade
you already wanted to take.</p>

<div class="callout risk">
  <span class="callout-label">A gap is not a reason on its own</span>
  <p>Imbalances are context, not entries. A gap with nothing else going for it is a rectangle. What
  makes one worth acting on is everything around it — where price came from, what it took on the
  way, and whether the move that left it was significant. That is what the rest of the curriculum
  is for.</p>
</div>
$html$,
  (select id from public.phases where slug = 'prerequisites'),
  2
)
on conflict (slug) do nothing;


insert into public.lessons (slug, title, summary, body_html, phase_id, sort_order)
values (
  'swing-points-and-structure',
  'Swing points and structure',
  'What a swing point is, why it can only be named late, and the one event that counts as a break.',
  $html$<figure class="figure">
<svg viewBox="0 0 720 320" role="img" aria-label="A sequence of higher highs and higher lows, then a lower high and a break below the last higher low">
  <line x1="50" y1="288" x2="670" y2="288" class="svg-axis"/>

  <path d="M 70 230 L 120 150 L 165 196 L 215 104 L 262 152 L 310 70" class="svg-up" stroke-width="1.9"/>
  <path d="M 310 70 L 360 128 L 410 96 L 470 176 L 530 210 L 600 250" class="svg-down" stroke-width="1.9"/>

  <circle cx="120" cy="150" r="4" class="svg-up-f"/>
  <circle cx="215" cy="104" r="4" class="svg-up-f"/>
  <circle cx="310" cy="70"  r="4" class="svg-up-f"/>
  <text x="104" y="140" class="svg-label">H</text>
  <text x="199" y="94"  class="svg-label">HH</text>
  <text x="294" y="60"  class="svg-label">HH</text>

  <circle cx="165" cy="196" r="4" class="svg-neutral-f"/>
  <circle cx="262" cy="152" r="4" class="svg-neutral-f"/>
  <text x="152" y="216" class="svg-label">L</text>
  <text x="248" y="172" class="svg-label">HL</text>

  <circle cx="410" cy="96" r="4" class="svg-down-f"/>
  <text x="396" y="86" class="svg-t-down">LH</text>

  <line x1="262" y1="152" x2="640" y2="152" class="svg-s-warn" stroke-width="1.4" stroke-dasharray="7 5"/>
  <text x="646" y="156" class="svg-t-warn">the last HL</text>
  <circle cx="452" cy="152" r="5" class="svg-warn-f"/>
  <text x="430" y="196" class="svg-t-warn">broken — this is the event</text>

  <text x="50" y="316" class="svg-label">A swing is only a swing once the candles either side of it exist. Naming one early is naming a guess.</text>
</svg>
<figcaption>Higher highs with higher lows is an uptrend, said precisely. The event that matters is
not the lower high — it is price closing below the last higher low, because that is the first thing
that could not happen if the uptrend were intact.</figcaption>
</figure>
<p>Almost everything else here is described in terms of structure, so this is worth getting exactly
right rather than approximately right.</p>

<h3>A swing point is only a swing point in hindsight</h3>

<p>A swing high is a candle with lower highs on both sides of it. A swing low is a candle with
higher lows on both sides. The definition contains a delay: <strong>you cannot identify one until
the candles after it have formed.</strong></p>

<p>That delay is not a flaw to engineer around. A high that might still be exceeded is not a high
yet, and any tool that marks one before it is confirmed will unmark it later. Naming a swing early
is naming a guess and then forgetting you guessed.</p>

<h3>The trend, said precisely</h3>

<p>An uptrend is <strong>higher highs and higher lows</strong>. A downtrend is lower highs and lower
lows. Anything else is neither, and "neither" is a legitimate reading that beginners avoid because
it feels like failing to have an opinion.</p>

<h3>What actually counts as a break</h3>

<p>Here is the part worth slowing down for. In an uptrend, a lower high on its own means nothing —
uptrends make lower highs all the time and carry on. The event that matters is price
<strong>closing below the last higher low</strong>, because that is the first thing that cannot
happen while the uptrend is intact.</p>

<p>Closing matters. A wick through a level and back is not the same as a body through it, and
treating them the same is how a chart appears to break structure four times an afternoon.</p>

<div class="callout warn">
  <span class="callout-label">Structure is timeframe-specific</span>
  <p>A five-minute downtrend inside an hourly uptrend is not a contradiction — it is the normal
  state of affairs. Saying "the trend is up" without saying on what timeframe is not a claim, it is
  a mood. Always name the chart you are reading it on.</p>
</div>
$html$,
  (select id from public.phases where slug = 'prerequisites'),
  3
)
on conflict (slug) do nothing;


insert into public.lessons (slug, title, summary, body_html, phase_id, sort_order)
values (
  'premium-and-discount',
  'Premium and discount',
  'Expensive or cheap relative to a range - and why choosing the range honestly is the entire difficulty.',
  $html$<figure class="figure">
<svg viewBox="0 0 720 300" role="img" aria-label="A range split at its midpoint, with the upper half labelled premium and the lower half discount">
  <rect x="140" y="50"  width="420" height="90" class="svg-zone-down"/>
  <rect x="140" y="150" width="420" height="90" class="svg-zone-up"/>

  <line x1="140" y1="50"  x2="560" y2="50"  class="svg-s-down" stroke-width="1.6"/>
  <line x1="140" y1="145" x2="560" y2="145" class="svg-s-ink" stroke-width="1.4" stroke-dasharray="8 5"/>
  <line x1="140" y1="240" x2="560" y2="240" class="svg-s-up" stroke-width="1.6"/>

  <text x="570" y="54"  class="svg-t-down">high</text>
  <text x="570" y="149" class="svg-label-em">midpoint</text>
  <text x="570" y="244" class="svg-t-up">low</text>

  <text x="152" y="98"  class="svg-t-down">PREMIUM — expensive. Where selling is worth considering</text>
  <text x="152" y="198" class="svg-t-up">DISCOUNT — cheap. Where buying is worth considering</text>

  <path d="M 160 220 L 210 178 L 250 214 L 300 120 L 350 96 L 400 138 L 450 72" class="svg-neutral" stroke-width="1.6"/>

  <text x="60" y="278" class="svg-label">The only question this answers is "expensive or cheap, relative to what". It is not a signal, and half a range is a big place.</text>
  <text x="60" y="296" class="svg-label">Everything depends on picking the high and low honestly — move them and you can prove any price is a discount.</text>
</svg>
<figcaption>Split a range at its midpoint. Above is premium, below is discount. The discipline is not
in the drawing — it is in choosing which high and which low define the range <em>before</em> you
have a trade in mind.</figcaption>
</figure>
<p>The simplest useful idea in the whole method, and the one most often applied carelessly.</p>

<p>Take a range — a defined high and a defined low. Split it in half. The upper half is
<strong>premium</strong>, the lower half is <strong>discount</strong>. If you are looking to buy, you
would rather do it in discount. If you are looking to sell, premium.</p>

<p>That is it. It is not a signal and it does not tell you when. It answers exactly one question:
<em>relative to this range, is this price expensive or cheap?</em></p>

<h3>The whole difficulty is choosing the range</h3>

<p>Everything above depends on which high and which low you picked, and nothing on the chart tells
you. Move the anchors and you can prove that any price is a discount — which means the tool will
happily confirm whatever you already wanted to do.</p>

<p>The discipline is to choose the range <strong>before</strong> you have a trade in mind, from
structural points you could defend to someone else: a swing high and swing low that are actually
confirmed, on a timeframe you named in advance.</p>

<h3>Half a range is a big place</h3>

<p>"In discount" is not an entry. On a hundred-point range it describes fifty points, and being
right about the half while wrong by forty points is still wrong. Premium and discount narrow where
you are willing to look. Something else has to decide where you act.</p>

<div class="callout risk">
  <span class="callout-label">The honest test</span>
  <p>If you find yourself redrawing the range after seeing a setup, you are not measuring — you are
  justifying. Everyone does it. The fix is to write the two anchor prices down before you look for
  anything, so that moving them is a decision you have to notice making.</p>
</div>
$html$,
  (select id from public.phases where slug = 'prerequisites'),
  4
)
on conflict (slug) do nothing;


insert into public.lessons (slug, title, summary, body_html, phase_id, sort_order)
values (
  'everything-is-new-york-time',
  'Everything here is New York time',
  'Set your chart before you read anything else, and why these particular hours.',
  $html$<figure class="figure">
<svg viewBox="0 0 720 260" role="img" aria-label="A 24 hour strip in New York time with the Asian, London and New York sessions marked">
  <line x1="60" y1="150" x2="670" y2="150" class="svg-axis"/>

  <rect x="60"  y="106" width="110" height="44" class="svg-zone-neutral"/>
  <text x="66"  y="100" class="svg-label">ASIA · 20:00-00:00</text>

  <rect x="188" y="106" width="96"  height="44" class="svg-zone-warn"/>
  <text x="194" y="100" class="svg-t-warn">LONDON · 02:00-05:00</text>

  <rect x="330" y="106" width="150" height="44" class="svg-zone-up"/>
  <text x="336" y="100" class="svg-t-up">NEW YORK · 07:00-10:00</text>

  <line x1="410" y1="76" x2="410" y2="164" class="svg-s-ink" stroke-width="1.6"/>
  <text x="380" y="70" class="svg-label-em">09:30 the bell</text>

  <text x="60"  y="172" class="svg-label">20:00</text>
  <text x="188" y="172" class="svg-label">02:00</text>
  <text x="330" y="172" class="svg-label">07:00</text>
  <text x="490" y="172" class="svg-label">12:00</text>
  <text x="630" y="172" class="svg-label">16:00</text>

  <text x="60" y="208" class="svg-label-em">Right-click the time axis on your chart and set the timezone to New York.</text>
  <text x="60" y="230" class="svg-label">Every window in this material is New York local. On any other setting the boxes are still correct and</text>
  <text x="60" y="248" class="svg-label">the labels no longer match what you read here — which is the confusing way to be wrong.</text>
</svg>
<figcaption>The sessions are not arbitrary. They are when the participants who move size are at their
desks, and they are stated in New York local time throughout — including through both daylight
saving changes, which is why the chart setting matters more than it sounds.</figcaption>
</figure>
<p>Every window in this material — every session, every killzone, every named hour — is
<strong>New York local time</strong>. Not UTC, not your broker's clock, not whatever your chart
opened with.</p>

<h3>Set your chart before anything else</h3>

<p>Right-click the time axis and set the timezone to New York. Do it now, before you read another
lesson.</p>

<p>The scripts in the members area compute their sessions in <code>America/New_York</code> regardless
of your chart setting, so the boxes land in the right place either way. What breaks is the
<em>labels</em>: the boxes will be correct and the axis will disagree with everything written here.
That is the confusing way to be wrong — much worse than being obviously wrong, because nothing looks
broken.</p>

<h3>Why these hours and not others</h3>

<p>The sessions are not superstition. They are when the people who move size are at their desks. A
level formed at 03:00 New York was formed by a different set of participants than one formed at
10:00, and the second is more likely to matter to what happens during the American session.</p>

<p>The bell at 09:30 is the sharpest of these boundaries. It is when index futures stop trading
against overnight positioning and start trading against the cash market.</p>

<h3>Daylight saving is the trap</h3>

<p>New York observes it and several other financial centres change on different dates. For a couple
of weeks each year, the London session sits an hour off where you expect relative to your local
clock. Anchoring to New York rather than to your own time zone makes this a non-event — which is the
real reason to do it, beyond simply matching the notes.</p>

<div class="callout warn">
  <span class="callout-label">Sessions are context, not permission</span>
  <p>Being inside a killzone is not a reason to trade. It is a reason to <em>look</em>. The windows
  narrow when you pay attention; they say nothing about whether there is anything worth paying
  attention to.</p>
</div>
$html$,
  (select id from public.phases where slug = 'prerequisites'),
  5
)
on conflict (slug) do nothing;


insert into public.lessons (slug, title, summary, body_html, phase_id, sort_order)
values (
  'risk-comes-first',
  'Risk comes first',
  'R as a unit, sizing as arithmetic, and the stop going where the trade is wrong rather than where the loss is comfortable.',
  $html$<figure class="figure">
<svg viewBox="0 0 720 280" role="img" aria-label="Entry, stop and target drawn so that the distance to the stop defines one R and the target is two R">
  <line x1="60" y1="250" x2="670" y2="250" class="svg-axis"/>

  <line x1="140" y1="180" x2="560" y2="180" class="svg-s-ink" stroke-width="1.6"/>
  <text x="570" y="184" class="svg-label-em">entry</text>

  <line x1="140" y1="220" x2="560" y2="220" class="svg-s-down" stroke-width="1.6"/>
  <text x="570" y="224" class="svg-t-down">stop</text>

  <line x1="140" y1="100" x2="560" y2="100" class="svg-s-up" stroke-width="1.6"/>
  <text x="570" y="104" class="svg-t-up">target</text>

  <rect x="150" y="180" width="30" height="40" class="svg-zone-down"/>
  <text x="188" y="205" class="svg-t-down">1R — the only part you choose</text>

  <rect x="150" y="140" width="30" height="40" class="svg-zone-up"/>
  <rect x="150" y="100" width="30" height="40" class="svg-zone-up"/>
  <text x="188" y="128" class="svg-t-up">2R — what the market may or may not give</text>

  <text x="60" y="278" class="svg-label">R is not a unit of money. It is the unit of "one of my losses", which is the only thing on the chart you control.</text>
</svg>
<figcaption>The distance from entry to stop is one R, and it is the one number you set. Size is then
arithmetic: how many contracts make that distance cost what you decided to risk. Everything else on
the chart is a proposal.</figcaption>
</figure>
<p>This lesson is last in the foundations and should probably be first. Everything else here is
about finding a trade. This is about still being here in six months, which is a strictly harder
problem and the one that actually decides the outcome.</p>

<h3>R is the only unit worth thinking in</h3>

<p>The distance from your entry to your stop is <strong>one R</strong>. Not a dollar amount — a
unit. A trade that made twice what it risked made 2R whether that was forty dollars or four
hundred.</p>

<p>Thinking in R does two things. It makes results comparable across instruments and account sizes,
and it stops the size of a win or a loss disguising how good or bad the decision was. A big winner
on an oversized position is not a good trade. It is a lucky one, and the difference stops being
academic the day it goes the other way.</p>

<h3>Size is arithmetic, not judgement</h3>

<p>Once you have decided what one R costs you in money, position size is division: how many contracts
make the distance from entry to stop equal that amount. The members area has a calculator for it, and
the arithmetic is not the hard part.</p>

<p>The hard part is that the stop goes where the trade is <em>wrong</em>, not where the loss becomes
comfortable. A stop placed for comfort will be hit by noise; a stop placed at invalidation will be
hit when you were actually wrong, which is the only kind of loss worth taking.</p>

<h3>What you control</h3>

<p>You choose the risk. The market decides the reward. That asymmetry is why every honest account of
this puts sizing before setups — you can be right about direction and still finish down, and no
amount of chart reading fixes an account that took too much on one idea.</p>

<div class="callout risk">
  <span class="callout-label">Before any of the rest of this</span>
  <p>Decide what one R is, in money, as a fixed fraction of the account. Write it down. If a setup
  requires a stop so wide that the position becomes uncomfortably small, that is the arithmetic
  working, not a reason to widen the risk.</p>
</div>
$html$,
  (select id from public.phases where slug = 'prerequisites'),
  6
)
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- Check. Expect 13 lessons in prerequisites, all 13 with a figure, and every
-- body a few KB rather than a few MB.
-- ---------------------------------------------------------------------------
--
-- select sort_order, slug,
--        pg_size_pretty(length(body_html)::bigint) as body,
--        (body_html like '%<figure%') as has_figure
--   from public.lessons
--  where phase_id = (select id from public.phases where slug = 'prerequisites')
--  order by sort_order;
