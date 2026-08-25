-- ===========================================================================
-- A mentor may only write where they were invited
--
-- Run in the Supabase SQL editor after trade-reviews.sql. Safe to re-run.
--
--
-- WHAT WAS WRONG, AND IT WAS CONFIRMED BY ATTACK RATHER THAN SUSPECTED
--
-- The read policy on `trades` is correctly narrow. The write policy on
-- `trade_reviews` was not, and the two were never compared:
--
--     -- trades: needs the member's own flag
--     using (shared_with_mentor and public.is_admin())
--
--     -- trade_reviews: needs neither
--     with check (public.is_admin() and author_id = auth.uid())
--
-- So an admin who could not READ a trade could still write a mentor reply on
-- it, and the reply lands in that member's journal.
--
-- Demonstrated on 19 August 2026 against the live database, from a browser
-- console signed in as an admin, with the control passing first:
--
--     read:      []   null        <- row-level security refused the trade
--     WROTE IT   [{...}]          <- and accepted a review on the same id
--
-- The control matters. An empty read proves RLS was on and working; without it
-- a successful write is equally consistent with the whole thing being off.
--
--
-- WHY IT IS WORSE THAN "A TRADE THEY ONCE SAW"
--
-- The first write-up of this assumed `trades.id` was a uuid, and argued the id
-- was not secret because it had been visible while the trade was shared. It is
-- a BIGINT. The attack does not need to have seen anything: 1, 2, 3 reaches
-- every trade in the table, including those belonging to members who have
-- never shared a single one.
--
-- Nothing here is a data leak - the admin still cannot read the trade. It is a
-- write outside consent, which is its own thing: a member who shares a trade,
-- gets an answer and unshares it had withdrawn nothing.
--
--
-- WHAT THIS COSTS, SAID PLAINLY
--
-- A mentor part-way through a reply when the member unshares will now be
-- refused on save. That is the correct answer - consent was withdrawn while
-- they typed - but it will read as a bug the first time it happens, so
-- `admin.html` names the cause instead of showing a bare policy violation.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The insert, narrowed to match the read
--
-- `exists` against `trades` rather than a join, and no reference to the row's
-- owner: an admin writing on a shared trade is the feature. The only thing
-- being added is that the trade must actually be shared, right now, at the
-- moment of the write.
-- ---------------------------------------------------------------------------

drop policy if exists "admins write reviews" on public.trade_reviews;

create policy "admins write reviews"
  on public.trade_reviews for insert
  with check (
    public.is_admin()
    and author_id = auth.uid()
    and exists (
      select 1 from public.trades t
       where t.id = trade_id
         and t.shared_with_mentor
    )
  );


-- ---------------------------------------------------------------------------
-- 2. What is deliberately NOT changed, and why each one is a decision
--
-- `admins read reviews` is still plain `is_admin()`. An admin can read every
-- reply on every trade, including threads on a trade since unshared. That is
-- narrower than it sounds - a review can only exist where a trade was shared
-- at some point, because both write policies require it - but it does mean
-- unsharing hides the trade and not the conversation about it. Left alone
-- because narrowing it would hide a mentor's own past answers from them, and
-- that is a product decision rather than a security fix.
--
-- `admins edit own reviews` is still unnarrowed for the same reason in the
-- other direction: a mentor fixing a typo in a reply that is already sitting
-- in somebody's journal is repairing something the member can already see.
-- Refusing that would leave the wrong text in place, which serves nobody.
--
-- Both are worth revisiting. Neither was demonstrated, and this file changes
-- only what was.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 3. Confirming the fix, which cannot be done from this editor
--
-- Row-level security does not apply to the table owner, so an insert run here
-- succeeds whether the policy holds or not. Re-run the attack from a browser
-- console signed in as an admin - the steps are in RLS-ATTACK-TESTS.md - and
-- expect the write to be refused where it previously succeeded:
--
--     REFUSED  42501  new row violates row-level security policy ...
--
-- Then the control, which must still pass: replying to a trade that IS shared
-- has to keep working. A fix that refuses everything is not a fix.
-- ---------------------------------------------------------------------------
