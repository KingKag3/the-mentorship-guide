-- ===========================================================================
-- Pine scripts for members
--
-- Run in the Supabase SQL editor after schema.sql. Safe to re-run.
--
-- The source lives here, in a table behind row-level security, and not as a
-- file in this repository. That is deliberate and it is the whole point:
-- DECISIONS.md 2026-08-04 moved the indicators to a private repo because this
-- one publishes itself to the web. A .pine file committed here would be
-- readable by anyone with the address regardless of what the members page
-- shows - the same argument README.md already makes about the concept pages.
--
-- The private the-mentorship-pine repo stays the source of truth. A version is
-- pasted in here to distribute it. Never the reverse: a change made only in the
-- admin form exists nowhere that is version controlled.
-- ===========================================================================


create table if not exists public.scripts (
  id            bigint generated always as identity primary key,
  slug          text        not null unique,
  title         text        not null,
  summary       text,
  version       text,
  -- What the member pastes into the Pine editor.
  source        text        not null,
  -- Anything specific to this script that the generic install steps do not
  -- cover: inputs worth changing, which timeframe to run it on, known limits.
  notes_html    text,
  pine_version  text        not null default 'v6',
  published     boolean     not null default false,
  sort_order    int         not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.scripts enable row level security;

drop policy if exists "members read scripts"  on public.scripts;
drop policy if exists "admins manage scripts" on public.scripts;

-- Published only, members and admins only. An anonymous caller cannot read the
-- source at all, which is the gate that the file-in-a-public-repo approach
-- could never provide.
create policy "members read scripts"
  on public.scripts for select
  using (published and public.is_member());

create policy "admins manage scripts"
  on public.scripts for all
  using (public.is_admin())
  with check (public.is_admin());


-- Keep updated_at honest without trusting the client to send it.
create or replace function public.touch_script()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists scripts_touch on public.scripts;

create trigger scripts_touch
  before update on public.scripts
  for each row execute function public.touch_script();
