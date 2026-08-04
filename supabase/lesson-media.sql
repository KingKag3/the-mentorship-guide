-- ===========================================================================
-- Lesson media: video + attachment links
--
-- Run in the Supabase SQL editor after schema.sql. Safe to re-run.
--
-- Note what this does NOT do: embedding a video does not gate it. The file is
-- served by the video host, not by us, so page-level permissions have no reach
-- over it. Use unlisted videos and understand that the URL is visible in the
-- page source to anyone who is signed in. Genuinely private video needs a host
-- with domain-locked playback or signed URLs.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Video on a lesson
--
-- The full URL is stored as pasted; the page extracts the ID at render time,
-- so a change of URL format later does not require a migration.
-- ---------------------------------------------------------------------------

alter table public.lessons
  add column if not exists video_url text;


-- ---------------------------------------------------------------------------
-- 2. Attachment links
--
-- Links rather than uploaded files. Access to whatever sits at the far end is
-- controlled by that service, not by the roles here - a public Drive link is
-- public no matter who can see this page.
-- ---------------------------------------------------------------------------

create table if not exists public.lesson_links (
  id          bigint generated always as identity primary key,
  lesson_id   bigint  not null references public.lessons(id) on delete cascade,
  label       text    not null,
  url         text    not null,
  sort_order  int     not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists lesson_links_lesson_idx
  on public.lesson_links (lesson_id, sort_order);

alter table public.lesson_links enable row level security;

drop policy if exists "members read lesson links"  on public.lesson_links;
drop policy if exists "admins manage lesson links" on public.lesson_links;

-- Visible only when the parent lesson is visible: published, and the caller is
-- a member or admin.
create policy "members read lesson links"
  on public.lesson_links for select
  using (
    public.is_member()
    and exists (
      select 1 from public.lessons l
      where l.id = lesson_links.lesson_id
        and l.published
    )
  );

create policy "admins manage lesson links"
  on public.lesson_links for all
  using (public.is_admin())
  with check (public.is_admin());
