-- ===========================================================================
-- Lesson media storage
--
-- Run in the Supabase SQL editor after schema.sql and lesson-media.sql.
-- Safe to re-run.
--
-- This is the part of the site where gating is real. Slides and PDFs live in a
-- private bucket; the page mints short-lived signed URLs at render time, and
-- only for a caller the policies below accept. A copied image URL stops
-- resolving within the hour.
--
-- Contrast with the YouTube embed, which no policy here can reach.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The bucket
--
-- public = false is the whole point. A public bucket hands out permanent
-- unauthenticated URLs and none of the policies below would apply.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('lesson-media', 'lesson-media', false)
on conflict (id) do update set public = false;


-- ---------------------------------------------------------------------------
-- 2. Who may read and write
--
-- Reading is what signing a URL requires: Supabase checks the caller can
-- select the object before it issues a token. So members can view, and nobody
-- else can mint a link at all.
--
-- The journal/ prefix is carved out of both the member read and the admin
-- update, because trade screenshots live in this bucket and belong to one
-- member each. Do not widen either of these back: the clause is not decorative
-- and `journal-media-privacy.sql` explains at length why. That file also adds
-- a RESTRICTIVE policy which will keep journal objects private even if this
-- one is widened by accident - but it should not have to.
-- ---------------------------------------------------------------------------

drop policy if exists "members read lesson media"   on storage.objects;
drop policy if exists "admins upload lesson media"  on storage.objects;
drop policy if exists "admins update lesson media"  on storage.objects;
drop policy if exists "admins delete lesson media"  on storage.objects;

create policy "members read lesson media"
  on storage.objects for select
  using (
    bucket_id = 'lesson-media'
    and public.is_member()
    and (storage.foldername(name))[1] is distinct from 'journal'
  );

create policy "admins upload lesson media"
  on storage.objects for insert
  with check (bucket_id = 'lesson-media' and public.is_admin());

-- A rename is an update, and moving journal/<uid>/x.jpg to lessons/x.jpg would
-- publish it to every member. Admins keep insert and delete over the whole
-- bucket; they do not get to move somebody's journal out of it.
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

create policy "admins delete lesson media"
  on storage.objects for delete
  using (bucket_id = 'lesson-media' and public.is_admin());


-- ---------------------------------------------------------------------------
-- 3. Lesson fields that come with a posted lesson
--
-- cover_path is a path inside the bucket, not a URL - URLs here would expire.
-- ---------------------------------------------------------------------------

alter table public.lessons
  add column if not exists cover_path text,
  add column if not exists phase      text;


-- ---------------------------------------------------------------------------
-- 4. Attachments can be a stored file or an external link
--
-- url becomes optional; exactly one of the two must be set.
-- ---------------------------------------------------------------------------

alter table public.lesson_links
  add column if not exists storage_path text,
  add column if not exists file_name    text,
  add column if not exists file_size    bigint;

alter table public.lesson_links
  alter column url drop not null;

alter table public.lesson_links
  drop constraint if exists lesson_links_target_check;

alter table public.lesson_links
  add constraint lesson_links_target_check
  check (
    (url is not null and storage_path is null)
    or
    (url is null and storage_path is not null)
  );
