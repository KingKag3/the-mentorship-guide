-- ===========================================================================
-- The bar fetcher reads the root, whatever shape the expiry arrived in
--
-- Run in the Supabase SQL editor after market-bars.sql. Safe to re-run.
--
--
-- WHY THIS EXISTS
--
-- `bar_sessions_wanted` maps a trade's symbol to the contract whose candles it
-- needs: MNQ and NQ both want NQ, MES and ES both want ES. It compared the
-- symbol as stored, which was fine while every symbol was stored as a root.
--
-- NinjaTrader writes `MNQ DEC26`, and the importer stored it whole - it knew
-- how to strip a trailing month code (`NQZ6`) and nothing else. So every trade
-- imported from that platform mapped to `MNQ DEC26`, which is neither NQ nor
-- ES, and the session was never asked for.
--
-- NOTHING ERRORED AND NOTHING WAS MISSING. The trades were right, the totals
-- were right, the calendar was right. The chart for those days simply drew the
-- fills with no candles behind them and said so in a note under itself - which
-- is the correct behaviour for a session with no bars, and indistinguishable
-- from a day Yahoo had nothing for.
--
-- The importer roots the symbol properly now, so this is about the rows
-- already stored. Rather than rewrite `trades` - which is a member's record
-- and not something to edit for the convenience of a fetcher - the mapping
-- strips the expiry on the way past.
--
--
-- THE THREE SHAPES, in the order they have turned up
--
--   CM.NQZ6     a venue prefix, from WealthCharts
--   MNQ DEC26   a spaced expiry, from NinjaTrader - also `NQ 12-26`
--   MNQZ6       a month code, from almost everybody
--
-- The venue prefix is only taken off where what remains is still a symbol, so
-- `BRK.B` is left alone. This project is futures and that case has not arisen;
-- the guard is there because the alternative is silent.
-- ===========================================================================

create or replace function public.bar_root_symbol(raw text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           split_part(
             case
               when upper(raw) ~ '^[A-Z]{1,4}\.(.{2,})$'
                 then regexp_replace(upper(raw), '^[A-Z]{1,4}\.', '')
               else upper(raw)
             end,
             ' ', 1),
           '[FGHJKMNQUVXZ][0-9]{1,2}$', '');
$$;

comment on function public.bar_root_symbol(text) is
  'MNQ DEC26 -> MNQ, CM.NQZ6 -> NQ, MNQZ6 -> MNQ. Used by bar_sessions_wanted '
  'so a symbol stored with its expiry still asks for the right candles.';


-- Note: `split_part(.., '' '', 1)` handles the space; a dash or slash form
-- (`NQ 12-26`) is already cut by it, because the space comes first. A symbol
-- written `NQ-12-26` with no space is not a shape anything here has produced.


-- ---------------------------------------------------------------------------
-- The same view, reading the root rather than the raw symbol
-- ---------------------------------------------------------------------------

create or replace function public.bar_sessions_wanted(
  tracked text[],
  since_days int default 60
)
returns table (symbol text, trading_day date)
language sql
stable
security definer
set search_path = public
as $$
  with wanted as (
    select
      case
        when public.bar_root_symbol(t.symbol) in ('MNQ', 'NQ') then 'NQ'
        when public.bar_root_symbol(t.symbol) in ('MES', 'ES') then 'ES'
        else public.bar_root_symbol(t.symbol)
      end as symbol,
      (((t.opened_at at time zone 'America/New_York') + interval '6 hours')::date) as trading_day
    from public.trades t
    where t.opened_at >= now() - make_interval(days => since_days)
  )
  select w.symbol, w.trading_day
    from wanted w
   where w.symbol = any(tracked)
   group by w.symbol, w.trading_day
  -- Not already fetched, and not already settled as empty. A failed day comes
  -- back, which is the point of separating "failed" from "empty".
  except
  select l.symbol, l.trading_day
    from public.bar_fetch_log l
   where l.status in ('ok', 'empty')
$$;

revoke all on function public.bar_sessions_wanted(text[], int) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- Check it. The first should return the three roots; the second should now
-- list the sessions that were being skipped.
-- ---------------------------------------------------------------------------
-- select public.bar_root_symbol('MNQ DEC26') as a,
--        public.bar_root_symbol('CM.NQZ6')   as b,
--        public.bar_root_symbol('MNQZ6')     as c;
--   expect  MNQ | NQ | MNQ
--
-- select * from public.bar_sessions_wanted(array['NQ','ES'], 60) order by trading_day;
