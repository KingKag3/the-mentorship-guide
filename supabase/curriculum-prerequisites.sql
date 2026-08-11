-- ---------------------------------------------------------------------------
-- Prerequisites: re-slot the arrays material, and give it diagrams
--
-- Two changes, and they are independent of each other.
--
-- 1. The seven lessons seeded as "Phase 2" were never Kag3's Phase 2. They are
--    the detail Phase 2 assumes - order block validity, inversions, the smaller
--    imbalances, internal versus external liquidity, the opening prices, the
--    five phases. They move to a section of their own that sits between Phase 1
--    and Phase 2, and `phase-2` is left empty for its real content.
--
-- 2. Every one of them gets a diagram. The material is spatial - a gap is a
--    shape, a range has an inside and an outside - and prose describing a shape
--    is the slowest way to transmit one.
--
-- Safe to re-run. The phase insert is ON CONFLICT DO NOTHING, the sort orders
-- and phase_id are single-column updates, and each figure is guarded on the
-- lesson not already having one.
--
-- EVERY DIAGRAM IS CLASS-ONLY. Not one carries a hex. style.css says a diagram
-- must never carry a colour literal or it will be wrong in one of the two
-- themes, and the diagrams on the public concept pages break that rule today -
-- they were drawn before light mode existed. These do not.
-- ---------------------------------------------------------------------------


-- 1. The section itself ------------------------------------------------------
--
-- Numbered in tens. Ones leave no room, which is how this situation arose: a
-- section had to go between 1 and 2 and there was no integer there.

insert into public.phases (slug, title, subtitle, sort_order)
values ('prerequisites', 'Prerequisites',
        'The detail Phase 2 assumes you already have', 20)
on conflict (slug) do nothing;

update public.phases set sort_order = 10 where slug = 'phase-1';
update public.phases set sort_order = 20 where slug = 'prerequisites';
update public.phases set sort_order = 30 where slug = 'phase-2';


-- 2. Move the seven ----------------------------------------------------------

update public.lessons
   set phase_id = (select id from public.phases where slug = 'prerequisites')
 where slug in (
   'order-block-validity',
   'inversions',
   'volume-imbalance-and-balanced-range',
   'the-gap-that-does-not-fill',
   'internal-and-external-liquidity',
   'opening-prices',
   'market-maker-model-phases'
 );


-- 3. Phase 2 is now empty, and unpublished until it is not --------------------
--
-- An empty published phase renders as a section with nothing in it, which reads
-- as a broken page rather than as one awaiting content. Flip `published` to
-- true when the real lessons land.

update public.phases
   set published = false,
       subtitle  = 'Yours to fill'
 where slug = 'phase-2';


-- 4. The diagrams ------------------------------------------------------------
--
-- Prepended, so the shape arrives before the prose describing it. Guarded on
-- the lesson not already carrying a <figure>, which is what makes this safe to
-- run twice.

update public.lessons
   set body_html = $fig$<figure class="figure">
<svg viewBox="0 0 720 300" role="img" aria-label="An order block, the level it took, and the imbalance it left, measured against each other">
  <line x1="60" y1="252" x2="660" y2="252" class="svg-axis"/>

  <!-- the level that got taken -->
  <line x1="60" y1="205" x2="660" y2="205" class="svg-s-mute" stroke-width="1.5" stroke-dasharray="7 5"/>
  <text x="60" y="198" class="svg-label">previous higher-timeframe low — check 1, it took something</text>

  <!-- prior drift down -->
  <path d="M 90 130 L 130 150 L 170 175 L 205 196" class="svg-neutral" stroke-width="1.5" fill="none"/>

  <!-- the block itself: last down-close candle -->
  <line x1="232" y1="188" x2="232" y2="228" class="svg-s-mute" stroke-width="1.5"/>
  <rect x="220" y="196" width="24" height="24" class="svg-f-surface svg-s-down" stroke-width="1.5"/>
  <text x="196" y="248" class="svg-label">the block</text>

  <!-- displacement up -->
  <line x1="300" y1="60" x2="300" y2="200" class="svg-s-up" stroke-width="1.5"/>
  <rect x="288" y="72" width="24" height="118" class="svg-f-up svg-s-up" stroke-width="1.5" opacity="0.42"/>

  <!-- the gap left behind -->
  <rect x="330" y="96" width="250" height="72" class="svg-zone-up"/>
  <line x1="330" y1="96"  x2="580" y2="96"  class="svg-s-up" stroke-width="1.2"/>
  <line x1="330" y1="168" x2="580" y2="168" class="svg-s-up" stroke-width="1.2"/>
  <text x="338" y="120" class="svg-t-up">the imbalance it left</text>

  <!-- the two measures, side by side, which is the whole point -->
  <line x1="628" y1="196" x2="628" y2="220" class="svg-s-mute" stroke-width="3"/>
  <text x="640" y="212" class="svg-label">block = 1</text>
  <line x1="606" y1="96" x2="606" y2="168" class="svg-s-up" stroke-width="3"/>
  <text x="618" y="136" class="svg-t-up">imbalance ≥ 2</text>

  <text x="60" y="284" class="svg-label">Check 3 is the only one that is a number — and a ratio does not go stale as the instrument moves.</text>
</svg>
<figcaption>The block is measured, the inefficiency it caused is measured, and the second must be at
least twice the first. A small block that produced an enormous displacement is a strong claim; a
large block that produced a move barely its own size is a candle with a box drawn round it.</figcaption>
</figure>
$fig$ || body_html
 where slug = 'order-block-validity'
   and body_html not like '%<figure%';

update public.lessons
   set body_html = $fig$<figure class="figure">
<svg viewBox="0 0 720 280" role="img" aria-label="A bullish fair value gap holding as support, then failing and acting as resistance">
  <text x="40" y="26" class="svg-label-em">BEFORE — the gap holds</text>
  <text x="400" y="26" class="svg-label-em">AFTER — price closed through it</text>

  <!-- before -->
  <rect x="40" y="120" width="290" height="46" class="svg-zone-up"/>
  <line x1="40" y1="120" x2="330" y2="120" class="svg-s-up" stroke-width="1.2"/>
  <line x1="40" y1="166" x2="330" y2="166" class="svg-s-up" stroke-width="1.2"/>
  <path d="M 60 80 L 110 118 L 150 143 L 190 120 L 240 78 L 300 52" class="svg-up" stroke-width="1.8"/>
  <circle cx="150" cy="143" r="4" class="svg-up-f"/>
  <text x="96" y="196" class="svg-t-up">tagged, held, continued</text>

  <!-- after -->
  <rect x="400" y="120" width="280" height="46" class="svg-zone-down"/>
  <line x1="400" y1="120" x2="680" y2="120" class="svg-s-down" stroke-width="1.2"/>
  <line x1="400" y1="166" x2="680" y2="166" class="svg-s-down" stroke-width="1.2"/>
  <path d="M 415 70 L 455 110 L 500 180 L 545 210 L 590 166 L 640 214" class="svg-down" stroke-width="1.8"/>
  <circle cx="590" cy="166" r="4" class="svg-down-f"/>
  <text x="470" y="196" class="svg-label">closed through, then retested from below</text>
  <text x="546" y="242" class="svg-t-down">the same prices, now resistance</text>
</svg>
<figcaption>A failed gap does not stop existing — it changes sides. The level is unchanged; what
changed is which direction it is expected to reject from. That is why an inversion is worth more
than a fresh gap: it has already been tested once, in public.</figcaption>
</figure>
$fig$ || body_html
 where slug = 'inversions'
   and body_html not like '%<figure%';

update public.lessons
   set body_html = $fig$<figure class="figure">
<svg viewBox="0 0 720 280" role="img" aria-label="A volume imbalance between two candle bodies, and a balanced price range where two opposing gaps overlap">
  <text x="40" y="26" class="svg-label-em">VOLUME IMBALANCE — bodies apart, wicks touching</text>

  <line x1="90" y1="70" x2="90" y2="150" class="svg-s-mute" stroke-width="1.5"/>
  <rect x="78" y="78" width="24" height="34" class="svg-f-surface svg-s-up" stroke-width="1.5"/>
  <line x1="160" y1="98" x2="160" y2="190" class="svg-s-mute" stroke-width="1.5"/>
  <rect x="148" y="128" width="24" height="42" class="svg-f-up svg-s-up" stroke-width="1.5" opacity="0.42"/>

  <rect x="60" y="112" width="130" height="16" class="svg-zone-warn"/>
  <text x="198" y="126" class="svg-t-warn">no body traded here — but the wicks did</text>

  <text x="400" y="26" class="svg-label-em">BALANCED PRICE RANGE — two gaps, opposite ways</text>
  <rect x="430" y="70"  width="230" height="70" class="svg-zone-up"/>
  <text x="438" y="88" class="svg-t-up">gap up</text>
  <rect x="430" y="108" width="230" height="72" class="svg-zone-down"/>
  <text x="438" y="174" class="svg-t-down">gap down</text>
  <rect x="430" y="108" width="230" height="32" class="svg-zone-neutral"/>
  <line x1="430" y1="108" x2="660" y2="108" class="svg-s-ink" stroke-width="1.4"/>
  <line x1="430" y1="140" x2="660" y2="140" class="svg-s-ink" stroke-width="1.4"/>
  <text x="452" y="130" class="svg-label-em">the overlap is the zone</text>

  <text x="40" y="232" class="svg-label">A volume imbalance is smaller than a fair value gap and far more common, which is the argument</text>
  <text x="40" y="250" class="svg-label">against trading it on a five-minute chart and the argument for marking it on an hourly one.</text>
</svg>
<figcaption>Two inefficiencies that are not fair value gaps. The volume imbalance sits between two
bodies where the wicks still overlap. The balanced price range is what is left when a gap one way
and a gap the other cover the same prices — both sides have been paid, so the zone is spent unless
price is arriving at it for a different reason.</figcaption>
</figure>
$fig$ || body_html
 where slug = 'volume-imbalance-and-balanced-range'
   and body_html not like '%<figure%';

update public.lessons
   set body_html = $fig$<figure class="figure">
<svg viewBox="0 0 720 270" role="img" aria-label="One gap rebalanced on the retracement and one left open inside a run, with the sources disagreeing about the second">
  <line x1="60" y1="228" x2="660" y2="228" class="svg-axis"/>

  <rect x="120" y="140" width="180" height="44" class="svg-zone-up"/>
  <path d="M 90 200 L 140 150 L 190 176 L 250 120 L 300 84" class="svg-up" stroke-width="1.8"/>
  <circle cx="190" cy="176" r="4" class="svg-up-f"/>
  <text x="110" y="206" class="svg-t-up">rebalanced — price came back and traded it</text>

  <rect x="400" y="80" width="220" height="52" class="svg-zone-warn"/>
  <line x1="400" y1="80"  x2="620" y2="80"  class="svg-s-warn" stroke-width="1.3" stroke-dasharray="6 4"/>
  <line x1="400" y1="132" x2="620" y2="132" class="svg-s-warn" stroke-width="1.3" stroke-dasharray="6 4"/>
  <path d="M 390 190 L 430 130 L 470 70 L 520 44 L 580 52 L 640 34" class="svg-warn" stroke-width="1.8"/>
  <text x="404" y="162" class="svg-t-warn">left open, and price kept going</text>

  <text x="60" y="256" class="svg-label">One source says every inefficiency is eventually rebalanced. Another carves out the run itself as the exception. Both cannot be applied to the same chart.</text>
</svg>
<figcaption>The conflict, drawn. If you believe every gap fills, the second zone is an entry waiting
to happen. If you believe a gap inside a genuine expansion is meant to stay open, it is the opposite
— evidence the move is real. Nothing on the chart tells you which, and the two readings give
opposite trades.</figcaption>
</figure>
$fig$ || body_html
 where slug = 'the-gap-that-does-not-fill'
   and body_html not like '%<figure%';

update public.lessons
   set body_html = $fig$<figure class="figure">
<svg viewBox="0 0 720 300" role="img" aria-label="A dealing range whose external liquidity sits beyond the high and low and whose internal liquidity sits inside it">
  <line x1="150" y1="56"  x2="600" y2="56"  class="svg-s-down" stroke-width="1.6"/>
  <line x1="150" y1="244" x2="600" y2="244" class="svg-s-up" stroke-width="1.6"/>
  <text x="608" y="60"  class="svg-t-down">range high</text>
  <text x="608" y="248" class="svg-t-up">range low</text>

  <!-- external: the stops beyond each extreme -->
  <rect x="150" y="34" width="450" height="20" class="svg-zone-down"/>
  <rect x="150" y="246" width="450" height="20" class="svg-zone-up"/>
  <text x="160" y="28" class="svg-label-em">EXTERNAL — resting stops, outside the range</text>
  <text x="160" y="282" class="svg-label-em">EXTERNAL — resting stops, outside the range</text>

  <!-- internal: gaps inside -->
  <rect x="200" y="104" width="150" height="34" class="svg-zone-neutral"/>
  <rect x="380" y="164" width="150" height="30" class="svg-zone-neutral"/>
  <text x="210" y="126" class="svg-label-em">gap</text>
  <text x="390" y="184" class="svg-label-em">gap</text>
  <text x="200" y="156" class="svg-label">INTERNAL — unfilled inefficiency, inside the range</text>

  <path d="M 170 200 L 230 130 L 290 176 L 350 120 L 420 180 L 480 92 L 545 60" class="svg-neutral" stroke-width="1.6"/>

  <text x="60" y="298" class="svg-label">Price is always going to one or the other. Naming which turns "where is it drawn" into a question with two answers.</text>
</svg>
<figcaption>Every draw on price is one of two things: the stops resting beyond a high or a low, or an
unfilled inefficiency inside the range. The value is not that the distinction is subtle — it is that
having only two answers stops the question being unanswerable.</figcaption>
</figure>
$fig$ || body_html
 where slug = 'internal-and-external-liquidity'
   and body_html not like '%<figure%';

update public.lessons
   set body_html = $fig$<figure class="figure">
<svg viewBox="0 0 720 280" role="img" aria-label="Midnight, 08:30 and 09:30 opens drawn as horizontal levels across the session">
  <line x1="70" y1="248" x2="680" y2="248" class="svg-axis"/>
  <text x="70"  y="266" class="svg-label">00:00</text>
  <text x="250" y="266" class="svg-label">08:30</text>
  <text x="360" y="266" class="svg-label">09:30</text>
  <text x="620" y="266" class="svg-label">16:00</text>

  <line x1="70"  y1="170" x2="680" y2="170" class="svg-s-ink" stroke-width="1.5"/>
  <text x="76"  y="163" class="svg-label-em">midnight open — the day the model measures</text>
  <line x1="250" y1="128" x2="680" y2="128" class="svg-s-warn" stroke-width="1.5" stroke-dasharray="7 5"/>
  <text x="256" y="121" class="svg-t-warn">08:30 — the release</text>
  <line x1="360" y1="104" x2="680" y2="104" class="svg-s-info" stroke-width="1.5" stroke-dasharray="7 5"/>
  <text x="366" y="97"  class="svg-label-em">09:30 — the bell</text>

  <path d="M 80 186 L 140 160 L 200 196 L 250 172 L 300 140 L 360 152 L 420 96 L 490 120 L 560 74 L 640 88" class="svg-neutral" stroke-width="1.6"/>

  <line x1="70" y1="204" x2="240" y2="204" class="svg-s-mute" stroke-width="1"/>
  <text x="76" y="222" class="svg-label">each open is read on its own timeframe — the daily one is not a five-minute level</text>
</svg>
<figcaption>Midnight is not the only open worth marking. Each is a reference for a different question,
and each is read on the timeframe it belongs to — treating the daily open as a five-minute level is
how a good reference becomes noise.</figcaption>
</figure>
$fig$ || body_html
 where slug = 'opening-prices'
   and body_html not like '%<figure%';

update public.lessons
   set body_html = $fig$<figure class="figure">
<svg viewBox="0 0 720 280" role="img" aria-label="The market maker model as five labelled phases across one session, with the hindsight problem marked">
  <line x1="50" y1="236" x2="680" y2="236" class="svg-axis"/>

  <path d="M 60 150 L 100 142 L 140 158 L 175 146" class="svg-neutral" stroke-width="1.8"/>
  <path d="M 175 146 L 205 196 L 230 186" class="svg-down" stroke-width="1.8"/>
  <path d="M 230 186 L 300 110 L 360 128 L 430 62" class="svg-up" stroke-width="1.8"/>
  <path d="M 430 62 L 470 74 L 505 58 L 545 80" class="svg-neutral" stroke-width="1.8"/>
  <path d="M 545 80 L 600 140 L 650 190" class="svg-down" stroke-width="1.8"/>

  <line x1="60"  y1="252" x2="175" y2="252" class="svg-s-mute" stroke-width="3"/>
  <text x="66"  y="270" class="svg-label">accumulation</text>
  <line x1="177" y1="252" x2="230" y2="252" class="svg-s-down" stroke-width="3"/>
  <text x="172" y="270" class="svg-t-down">manipulation</text>
  <line x1="232" y1="252" x2="430" y2="252" class="svg-s-up" stroke-width="3"/>
  <text x="290" y="270" class="svg-t-up">expansion</text>
  <line x1="432" y1="252" x2="545" y2="252" class="svg-s-mute" stroke-width="3"/>
  <text x="446" y="270" class="svg-label">distribution</text>
  <line x1="547" y1="252" x2="655" y2="252" class="svg-s-down" stroke-width="3"/>
  <text x="560" y="270" class="svg-t-down">reversal</text>

  <rect x="232" y="40" width="200" height="20" class="svg-zone-warn"/>
  <text x="240" y="55" class="svg-t-warn">the only phase you can name while it is happening</text>

  <line x1="175" y1="40" x2="175" y2="236" class="svg-s-warn" stroke-width="1" stroke-dasharray="4 4"/>
  <text x="60" y="34" class="svg-label">everything left of here is named after the fact</text>
</svg>
<figcaption>The shape is real and the labels are useful afterwards. The trap is that four of the five
phases can only be identified once the session has resolved — which makes this a good way to review
a day and a poor way to trade one.</figcaption>
</figure>
$fig$ || body_html
 where slug = 'market-maker-model-phases'
   and body_html not like '%<figure%';


-- ---------------------------------------------------------------------------
-- Check. Expect: prerequisites 20 with 7 lessons, phase-2 30 with 0 and not
-- published, and 7 in the figures column. A lesson counted but not figured
-- means the guard matched something unexpected.
-- ---------------------------------------------------------------------------
--
-- select p.slug, p.sort_order, p.published,
--        count(l.id)                                    as lessons,
--        count(*) filter (where l.body_html like '%<figure%') as figures
--   from public.phases p
--   left join public.lessons l on l.phase_id = p.id
--  group by p.slug, p.sort_order, p.published
--  order by p.sort_order;
