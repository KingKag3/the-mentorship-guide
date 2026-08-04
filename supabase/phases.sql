-- ===========================================================================
-- Phases: the book structure
--
-- Run in the Supabase SQL editor after storage.sql. Safe to re-run.
--
-- A phase is a part of the curriculum; lessons are the numbered chapters
-- inside it. Ordering is explicit rather than by date, so the index reads as a
-- table of contents rather than a feed.
-- ===========================================================================


create table if not exists public.phases (
  id          bigint generated always as identity primary key,
  slug        text        not null unique,
  title       text        not null,
  subtitle    text,
  cover_path  text,
  sort_order  int         not null default 0,
  published   boolean     not null default true,
  created_at  timestamptz not null default now()
);

alter table public.phases enable row level security;

drop policy if exists "members read phases"  on public.phases;
drop policy if exists "admins manage phases" on public.phases;

create policy "members read phases"
  on public.phases for select
  using (published and public.is_member());

create policy "admins manage phases"
  on public.phases for all
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- Lessons belong to a phase.
--
-- on delete set null rather than cascade: deleting a phase should orphan its
-- lessons into the unfiled section, never silently destroy the writing.
-- ---------------------------------------------------------------------------

alter table public.lessons
  add column if not exists phase_id bigint references public.phases(id) on delete set null;

create index if not exists lessons_phase_idx
  on public.lessons (phase_id, sort_order);


-- ---------------------------------------------------------------------------
-- A first phase, so the index is not empty, with any existing lessons filed
-- into it.
-- ---------------------------------------------------------------------------

insert into public.phases (slug, title, subtitle, sort_order)
values ('phase-1', 'Phase 1', 'Core curriculum', 1)
on conflict (slug) do nothing;

update public.lessons
   set phase_id = (select id from public.phases where slug = 'phase-1')
 where phase_id is null;
