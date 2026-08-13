-- ===========================================================================
-- Let the member answer back
--
-- Run in the Supabase SQL editor after trade-reviews.sql. Safe to re-run.
--
-- trade-reviews.sql said outright what this is:
--
--     Not a thread. Only an admin may write, so a member cannot answer back
--     inside the app. Adding that later is one insert policy and no schema
--     change - the author_id column is already there and already defaults to
--     the caller.
--
-- That held. There is no ALTER TABLE below, and no new column. A reply from a
-- member is the same row a reply from a mentor is; the only thing that differs
-- is who wrote it.
--
--
-- HOW A MENTOR MESSAGE IS TOLD FROM A MEMBER MESSAGE
--
-- By comparing author_id with the trade's user_id, and by nothing else.
--
-- The tempting alternative is to look up the author's role in profiles. Do not:
-- a role is current, and a message is history. Promote a member to admin and
-- every question they ever asked retroactively becomes a mentor's answer. The
-- comparison here cannot go stale, because neither side of it ever changes.
--
-- It also means a mentor writing on their OWN shared trade reads as the member,
-- which is correct - on that trade they are.
--
--
-- WHAT REOPENS THE QUEUE
--
-- Before this, "answered" meant a reply newer than the trade's updated_at, so
-- the only way back into the queue was to edit the trade. That is now wrong in
-- a way that would lose questions silently: a member replying to an answer
-- would be writing a review, making the newest review newer still, and marking
-- their own question as answered. The mentor would never see it.
--
-- So the rule gains a clause. A shared trade is waiting when:
--
--   a) nobody has written anything, or
--   b) the newest message is from the member - they had the last word, or
--   c) the newest MENTOR message is older than the trade's updated_at - the
--      old rule, still doing its job, so an edit after an answer reopens it.
--
-- The query at the bottom is the same rule in SQL, for checking the page
-- against something other than itself.
--
--
-- WHAT THIS STILL IS NOT
--
-- No unread count and no notification. Both need somewhere to record what has
-- been seen, which is a real table with a real question behind it - per member
-- per trade, or a single last-read stamp? - and neither is worth guessing at
-- until somebody has had a conversation here. The mentor gets a queue that
-- reopens, which is the half that stops a question being lost.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. A member may write on their own trade, while it is shared
--
-- Both halves matter. Own trade, so nobody can write on somebody else's thread;
-- and shared, so the box a member types into is the same tick that put the
-- trade in front of a mentor. Untick it and the conversation stops - which is
-- the behaviour the tick already implied, now enforced rather than hoped for.
--
-- author_id = auth.uid() repeats what the column default already does. The
-- default is a convenience for an honest client; this is the part that holds
-- for a dishonest one.
-- ---------------------------------------------------------------------------

drop policy if exists "members reply on own shared trades" on public.trade_reviews;

create policy "members reply on own shared trades"
  on public.trade_reviews for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.trades t
       where t.id = trade_id
         and t.user_id = auth.uid()
         and t.shared_with_mentor
    )
  );


-- ---------------------------------------------------------------------------
-- 2. And may correct or withdraw what they wrote
--
-- The same two rights the mentor already has over their own words, for the
-- same reason: a typo in a question is as common as a typo in an answer.
--
-- Deliberately NOT conditional on the trade still being shared. Unsharing stops
-- new messages; it must not strand the ones already written, or a member could
-- put their own words permanently beyond their reach by unticking a box.
-- ---------------------------------------------------------------------------

drop policy if exists "members edit own replies"   on public.trade_reviews;
drop policy if exists "members delete own replies" on public.trade_reviews;

create policy "members edit own replies"
  on public.trade_reviews for update
  using (
    author_id = auth.uid()
    and exists (select 1 from public.trades t
                 where t.id = trade_id and t.user_id = auth.uid())
  )
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.trades t
                 where t.id = trade_id and t.user_id = auth.uid())
  );

create policy "members delete own replies"
  on public.trade_reviews for delete
  using (
    author_id = auth.uid()
    and exists (select 1 from public.trades t
                 where t.id = trade_id and t.user_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- 3. Checks worth running once
-- ---------------------------------------------------------------------------

-- a) Eight policies now, and still not one that lets a member read or write on
--    a trade that is not theirs. Read the `qual` column, not just the count.
--
-- select policyname, cmd, permissive
--   from pg_policies
--  where schemaname = 'public' and tablename = 'trade_reviews'
--  order by cmd, policyname;

-- b) The queue, exactly as admin.html computes it. `waiting` should be true for
--    a trade whose last message came from the member, and false for one whose
--    last message came from the mentor - unless the trade was edited after it.
--
-- select t.id,
--        count(r.id)                                          as messages,
--        max(r.created_at) filter (where r.author_id <> t.user_id) as answered_at,
--        (max(r.created_at) is null)
--          or (max(r.created_at) = max(r.created_at)
--              filter (where r.author_id = t.user_id))
--          or (max(r.created_at) filter (where r.author_id <> t.user_id)
--              < t.updated_at)                                as waiting
--   from public.trades t
--   left join public.trade_reviews r on r.trade_id = t.id
--  where t.shared_with_mentor
--  group by t.id, t.user_id, t.updated_at
--  order by t.opened_at desc;

-- c) The one that cannot be checked from here. A member writing on somebody
--    else's trade must be refused, and no query run as the table owner will
--    tell you that - RLS does not apply to the owner. It needs a second signed
--    -in account and the steps in HANDOVER.md.
