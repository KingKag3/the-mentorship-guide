-- ===========================================================================
-- Journal screenshots stop being readable by every other member
--
-- Run in the Supabase SQL editor after storage.sql and trades.sql. Safe to
-- re-run.
--
-- The bug this fixes
-- ------------------
-- trades.sql said its two journal policies "narrow it further so a member can
-- only reach their own folder". They do not, and could not. Postgres RLS
-- policies are PERMISSIVE unless declared otherwise, and permissive policies
-- for the same command are OR'd together. Adding a narrow policy never takes
-- anything away - it only adds another way in.
--
-- So with storage.sql's
--
--     create policy "members read lesson media"
--       on storage.objects for select
--       using (bucket_id = 'lesson-media' and public.is_member());
--
-- in place, any signed-in member could read every object in the bucket,
-- including journal/<somebody else's id>/<uuid>.jpg. The only thing standing
-- between one member and another member's trade screenshots was the uuid in
-- the filename - obscurity, not access control. Signed URLs did not help:
-- Supabase checks that the caller may SELECT the object *before* it mints one,
-- so a caller who passes that check can sign a link to anything they can name.
--
-- The fix, and why it is not a second bucket
-- ------------------------------------------
-- Moving journal media to its own bucket was the other candidate. It is
-- rejected because it strands everything already uploaded: storage.objects
-- rows point at bytes stored under their bucket, so no SQL statement can move
-- an object across buckets, and after a client-side copy every
-- trades.screenshot_path would need rewriting on rows that an admin
-- deliberately cannot update (see the absent admin write policy in
-- trades.sql). That trades a read hole for a write hole.
--
-- Instead the narrowing is made real, with a RESTRICTIVE policy. Restrictive
-- policies are AND'd with the permissive ones rather than OR'd, so section 3
-- below holds even if somebody later adds a permissive policy granting the
-- whole bucket. That is the property the second bucket was wanted for, and it
-- applies to objects already uploaded rather than only to new ones.
--
-- What happens to objects already uploaded
-- ----------------------------------------
-- Nothing moves and nothing is deleted. Every journal object stays exactly
-- where it is, at journal/<user id>/<uuid>.<ext>, and its own uploader keeps
-- reading it - the owner check reads the path that was already there, so it
-- works retroactively. What changes is who else can: other members lose access
-- immediately on running this, and admins keep it only for a screenshot hanging
-- off a trade whose owner ticked shared_with_mentor.
--
-- One case to know about: any journal object whose path is not
-- journal/<uploader's user id>/... becomes unreadable to everyone through the
-- API. journal.html has always built the path from profile.id, so there should
-- be none. Section 5 has the query that says whether that is true here.
--
-- Lesson media - lessons/, covers/, files/ - is untouched.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. May an admin read this particular journal object?
--
-- Mirrors "admins read shared" on the trades table: opt-in, per trade, by the
-- member who owns it. An admin gets the screenshot because a trade pointing at
-- it is flagged, never because the object sits in a bucket they can reach.
--
-- SECURITY DEFINER so the answer does not depend on the caller's own policies
-- on trades, and is_admin() is inside the function rather than left to the
-- caller, so this cannot become an oracle telling an ordinary member which
-- paths exist.
-- ---------------------------------------------------------------------------

create or replace function public.is_shared_journal_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() and exists (
    select 1
      from public.trades
     where screenshot_path = object_name
       and shared_with_mentor
  );
$$;

-- The lookup above runs per object while the Review tab signs its URLs.
create index if not exists trades_screenshot_idx
  on public.trades (screenshot_path)
  where screenshot_path is not null;


-- ---------------------------------------------------------------------------
-- 2. The permissive policies: one per audience, each scoped to its own
--
-- Read these as "here is a way in". None of them may overlap the journal
-- prefix except the two that are meant to.
--
-- `is distinct from` rather than `<>` on purpose: storage.foldername() returns
-- an empty array for an object at the bucket root, so [1] is NULL there, and
-- NULL <> 'journal' is NULL, which reads as false and would hide the object.
-- ---------------------------------------------------------------------------

drop policy if exists "members read lesson media"        on storage.objects;
drop policy if exists "admins update lesson media"       on storage.objects;
drop policy if exists "members read own journal media"   on storage.objects;
drop policy if exists "admins read shared journal media" on storage.objects;

-- Was: bucket_id = 'lesson-media' and public.is_member(). The added clause is
-- what stops this policy claiming journal objects at all. It is belt and
-- braces - section 3 would catch it anyway - but a policy that grants more
-- than it means to is how this bug happened the first time.
create policy "members read lesson media"
  on storage.objects for select
  using (
    bucket_id = 'lesson-media'
    and public.is_member()
    and (storage.foldername(name))[1] is distinct from 'journal'
  );

-- A member reads their own folder, and that is the whole of it.
create policy "members read own journal media"
  on storage.objects for select
  using (
    bucket_id = 'lesson-media'
    and (storage.foldername(name))[1] = 'journal'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- The mentor reads a screenshot they were shown, and nothing else in the
-- folder it came from.
create policy "admins read shared journal media"
  on storage.objects for select
  using (
    bucket_id = 'lesson-media'
    and (storage.foldername(name))[1] = 'journal'
    and public.is_shared_journal_object(name)
  );

-- Admin UPDATE is narrowed too, and this one is not cosmetic. A rename is an
-- update, and an update that moves journal/<uid>/x.jpg to lessons/x.jpg turns
-- an object nobody may read into one every member may. Admins keep INSERT and
-- DELETE over the bucket, which reveal nothing and leave the orphan cleanup
-- that a deleted trade needs possible.
create policy "admins update lesson media"
  on storage.objects for update
  using (
    bucket_id = 'lesson-media'
    and public.is_admin()
    and (storage.foldername(name))[1] is distinct from 'journal'
  )
  with check (
    bucket_id = 'lesson-media'
    and public.is_admin()
    and (storage.foldername(name))[1] is distinct from 'journal'
  );


-- ---------------------------------------------------------------------------
-- 3. The restrictive policy: the one that cannot be OR'd away
--
-- Read this one as "and regardless of the above". It grants nothing by itself
-- - a restrictive policy never does - it removes. Every permissive SELECT
-- policy on storage.objects, including ones written years from now by somebody
-- who has not read this file, is AND'd with it.
--
-- Written as a disjunction so it is inert everywhere it is not needed: other
-- buckets pass on the first clause, non-journal objects on the second.
--
-- SELECT only, deliberately. This is a confidentiality rule about reading, and
-- scoping it to SELECT keeps it out of the way of the member's own upload and
-- of admin cleanup. The one write that could have leaked a read - the rename -
-- is handled in section 2 instead.
-- ---------------------------------------------------------------------------

drop policy if exists "journal media is owner only" on storage.objects;

create policy "journal media is owner only"
  on storage.objects
  as restrictive
  for select
  using (
    bucket_id <> 'lesson-media'
    or (storage.foldername(name))[1] is distinct from 'journal'
    or (storage.foldername(name))[2] = auth.uid()::text
    or public.is_shared_journal_object(name)
  );


-- ---------------------------------------------------------------------------
-- 4. What the bucket now looks like, in one place
--
--   lessons/, covers/, files/     every member reads      (permissive, §2)
--   journal/<uid>/...             that uid reads          (permissive, §2)
--   journal/<uid>/...             an admin reads it only if some trade points
--                                 at it with shared_with_mentor set  (§2)
--   anything under journal/       nobody else, ever       (restrictive, §3)
--
-- Writes are unchanged except for the admin rename above: a member may INSERT
-- into their own journal folder (trades.sql), admins may INSERT and DELETE
-- across the bucket (storage.sql).
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 5. Checks worth running once, in the SQL editor
--
-- These run as the postgres role, which bypasses RLS - they describe the data,
-- they do not prove the policies. Two signed-in accounts do that; the
-- verification steps are in HANDOVER.md.
-- ---------------------------------------------------------------------------

-- a) Journal objects whose path does not name a real user. Expect 0 rows.
--    Anything listed here is now unreachable through the API and needs moving
--    by hand from the Storage dashboard before it is readable again.
--
-- select o.name
--   from storage.objects o
--  where o.bucket_id = 'lesson-media'
--    and (storage.foldername(o.name))[1] = 'journal'
--    and not exists (
--          select 1 from public.profiles p
--           where p.id::text = (storage.foldername(o.name))[2]
--        );

-- b) Screenshots an admin can currently reach, and who shared them. Expect
--    only trades with shared_with_mentor set, and nothing else in the bucket.
--
-- select t.id, t.user_id, t.screenshot_path
--   from public.trades t
--  where t.shared_with_mentor
--    and t.screenshot_path is not null
--  order by t.opened_at desc;

-- c) Every SELECT policy on the bucket, and which kind each one is. Expect
--    three permissive rows and one restrictive.
--
-- select policyname, permissive, cmd
--   from pg_policies
--  where schemaname = 'storage' and tablename = 'objects'
--    and cmd in ('SELECT', 'ALL')
--  order by permissive desc, policyname;
