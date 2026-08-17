-- ===========================================================================
-- Profile pictures
--
-- Run in the Supabase SQL editor after storage.sql, profiles-self-service.sql
-- and journal-media-privacy.sql. Safe to re-run.
--
-- THIS IS THE FIRST MEMBER-UPLOADED IMAGE OTHER MEMBERS SEE
--
-- Every image a member has uploaded until now has been private. Journal
-- screenshots are readable by their owner and, on a shared trade, by a mentor -
-- which is what journal-media-privacy.sql exists to enforce, with a RESTRICTIVE
-- policy so a later permissive one cannot undo it.
--
-- An avatar is the opposite by design. It appears beside a name, to everybody,
-- on every page where that person is mentioned. So this migration is short and
-- the thinking is mostly about what it lets in.
--
--
-- WHAT ALREADY WORKS, AND IS NOT REPEATED HERE
--
-- Reading. storage.sql's policy is:
--
--     bucket_id = 'lesson-media'
--     and public.is_member()
--     and (storage.foldername(name))[1] is distinct from 'journal'
--
-- Anything outside journal/ in that bucket is already readable by any signed-in
-- member, and an avatar is exactly that. Adding a second permissive read policy
-- would grant nothing and would be one more thing to reason about the next time
-- somebody audits this bucket.
--
-- The restrictive policy does not interfere either: its first clause passes
-- anything whose first folder is not `journal`, and it is `for select` only, so
-- it has no opinion about writes at all.
--
--
-- WHAT DOES NOT WORK YET, AND IS THE WHOLE FILE
--
-- Writing. A member may INSERT into journal/<their id>/ (trades.sql) and
-- nowhere else. Uploading a picture needs the same right over
-- avatars/<their id>/, plus update and delete so a picture can be replaced or
-- taken down by the person in it.
--
--
-- MODERATION IS NOT SOLVED HERE, AND SHOULD NOT BE ASSUMED
--
-- Nothing in Postgres can tell whether an image is acceptable. What this gives
-- is the ability to remove one: an admin already holds DELETE across the bucket
-- (storage.sql), and clearing profiles.avatar_path takes it off every page at
-- once - the two together are the whole remedy, and they are deliberately
-- separate, because taking a picture down should not require deleting bytes
-- somebody may want to look at first.
--
-- The default is initials drawn in the browser, so a member who uploads nothing
-- still has a face beside their name and there is no empty state to fill.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Where the picture is
--
-- A path, not a URL. The bucket is private, so what a page needs is a signed
-- link minted per view - storing a URL would store one that expires.
--
-- No new policy for this column. profiles-self-service.sql already grants
-- "update own profile" over the row, and its trigger guards exactly three
-- columns: role, id and email. avatar_path is none of them, so a member
-- setting their own is the policy already in place doing what it says.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists avatar_path text;

comment on column public.profiles.avatar_path is
  'Object path in the lesson-media bucket, under avatars/<user id>/. Null means '
  'no picture, and the page draws initials rather than an empty circle. '
  'Clearing this hides the picture everywhere without deleting the object.';


-- ---------------------------------------------------------------------------
-- 2. A member may write inside their own avatars folder, and nowhere else
--
-- (storage.foldername(name))[1] is the first path segment and [2] is the
-- second, so avatars/<uid>/whatever.jpg is pinned on both. The same shape
-- trades.sql uses for journal/, for the same reason.
--
-- Three policies rather than one `for all`: a grant that covers insert, update
-- and delete in a single line reads as smaller than it is, and the next person
-- to narrow one of the three would have to split it first.
-- ---------------------------------------------------------------------------

drop policy if exists "members upload own avatar"  on storage.objects;
drop policy if exists "members replace own avatar" on storage.objects;
drop policy if exists "members remove own avatar"  on storage.objects;

create policy "members upload own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'lesson-media'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "members replace own avatar"
  on storage.objects for update
  using (
    bucket_id = 'lesson-media'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'lesson-media'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "members remove own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'lesson-media'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );


-- ---------------------------------------------------------------------------
-- 3. What existing data does
--
-- Nothing. Every profile gets a null and draws initials, which is the same
-- thing it drew before this ran, because there was nothing else to draw.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 4. Checks worth running once
-- ---------------------------------------------------------------------------

-- a) The column, nullable.
--
-- select column_name, is_nullable from information_schema.columns
--  where table_schema = 'public' and table_name = 'profiles'
--    and column_name = 'avatar_path';

-- b) The three new write policies, and the read policy that was already there.
--    Expect the three below plus storage.sql's, and expect the RESTRICTIVE
--    journal one to still be present - its absence is a different bug coming
--    back, and nothing in the UI would show it.
--
-- select policyname, cmd, permissive from pg_policies
--  where schemaname = 'storage' and tablename = 'objects'
--  order by permissive desc, cmd, policyname;

-- c) The one that cannot be checked from here. A member must NOT be able to
--    write into avatars/<somebody else's id>/, and RLS does not apply to the
--    table owner, so the SQL editor will happily do it and prove nothing. It
--    needs a signed-in member's own client attempting the upload with another
--    uuid in the path, and being refused.
