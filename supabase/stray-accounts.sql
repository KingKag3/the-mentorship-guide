-- ===========================================================================
-- Whose trades are these?
--
-- READ THIS BEFORE THE QUERIES. It is the reason the earlier version of this
-- file was dangerous.
--
-- THE SQL EDITOR BYPASSES ROW-LEVEL SECURITY.
--
-- It connects as the table owner, and RLS does not apply to the owner. So
-- `select ... from public.trades` in that editor returns EVERY MEMBER'S
-- JOURNAL, not the journal of whoever is signed into the site. Nothing about
-- the result says so.
--
-- That is why six unrecognised accounts turned up next to Kag3's nineteen.
-- The obvious reading - "stray rows from a file I no longer have" - was wrong.
-- The likely reading is that they belong to other members, who imported their
-- own Apex exports, and a delete keyed on account name alone would have taken
-- somebody else's trading history with it.
--
-- Every query below therefore names the owner. Nothing here deletes.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Every account in the journal, and who owns it
--
-- If the six unrecognised accounts come back under a different email, they are
-- somebody else's and the question is closed: leave them alone.
-- ---------------------------------------------------------------------------

select p.email                                as owner,
       p.full_name,
       t.account,
       count(*)                               as trades,
       round(sum(t.net_pnl), 2)               as total,
       min(t.opened_at)::date                 as first_day,
       max(t.opened_at)::date                 as last_day
  from public.trades t
  join public.profiles p on p.id = t.user_id
 group by p.email, p.full_name, t.account
 order by p.email, t.account;


-- ---------------------------------------------------------------------------
-- 2. The same, one line per member
--
-- How much of the table belongs to whom. A member with a handful of trades and
-- one with five hundred both look like "an account" in the query above.
-- ---------------------------------------------------------------------------

select p.email                                as owner,
       count(distinct t.account)              as accounts,
       count(*)                               as trades,
       round(sum(t.net_pnl), 2)               as total,
       min(t.opened_at)::date                 as first_day,
       max(t.opened_at)::date                 as last_day
  from public.trades t
  join public.profiles p on p.id = t.user_id
 group by p.email
 order by count(*) desc;


-- ---------------------------------------------------------------------------
-- 3. Kag3's nineteen, and nothing else
--
-- The figures that were being checked all along, scoped to one owner so the
-- answer cannot be contaminated by anybody else's rows.
--
-- Expect nineteen accounts and 61,302.50. If it comes back different from the
-- unscoped version run earlier, the unscoped version was reading other people's
-- trades into the total - which is precisely the thing this file exists to
-- stop.
-- ---------------------------------------------------------------------------

select t.account,
       count(*)                               as trades,
       round(sum(t.net_pnl), 2)               as total
  from public.trades t
  join public.profiles p on p.id = t.user_id
 where p.email = 'kingkag3@proton.me'
 group by t.account
 order by t.account;

select round(sum(t.net_pnl), 2)               as kag3_total,
       count(*)                               as kag3_trades
  from public.trades t
  join public.profiles p on p.id = t.user_id
 where p.email = 'kingkag3@proton.me';


-- ---------------------------------------------------------------------------
-- 4. Only if something really does need removing
--
-- Commented out, and scoped to one owner even so. A delete keyed on account
-- name alone reaches across every member in the table, and there is no
-- undo - trade_reviews cascades with it.
-- ---------------------------------------------------------------------------

-- delete from public.trades t
--  using public.profiles p
--  where p.id = t.user_id
--    and p.email = 'kingkag3@proton.me'
--    and t.account in ( ...names, checked against section 1 first... );
