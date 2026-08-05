-- ===========================================================================
-- Trade Karma — Supabase schema
--
-- Paste this whole file into the Supabase SQL editor and run it once.
-- It is safe to re-run: every object is created with "if not exists" or
-- replaced.
--
-- Security model
-- --------------
-- The browser only ever holds the anon key, which grants no privileges by
-- itself. Everything below is enforced by Postgres row-level security, so a
-- user cannot read or change anything by editing JavaScript in devtools.
--
-- Three roles, stored on public.profiles.role:
--   pending  new signup, can see nothing but their own profile row
--   member   can read published lessons
--   admin    can read and change every profile, and manage lessons
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text        not null,
  full_name   text,
  role        text        not null default 'pending'
                          check (role in ('pending', 'member', 'admin')),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;


-- ---------------------------------------------------------------------------
-- 2. Role helpers
--
-- These are SECURITY DEFINER so they can read profiles without triggering the
-- policies on profiles — which would otherwise recurse infinitely. Keep them
-- narrow: they answer one boolean question and nothing else.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('member', 'admin')
  );
$$;


-- ---------------------------------------------------------------------------
-- 3. Profile policies
--
-- Note what is deliberately absent: there is no policy letting a user update
-- their own row. That is the whole defence against self-promotion to admin.
-- ---------------------------------------------------------------------------

drop policy if exists "read own profile"       on public.profiles;
drop policy if exists "admins read profiles"   on public.profiles;
drop policy if exists "admins update profiles" on public.profiles;
drop policy if exists "admins delete profiles" on public.profiles;

create policy "read own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "admins read profiles"
  on public.profiles for select
  using (public.is_admin());

create policy "admins update profiles"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins delete profiles"
  on public.profiles for delete
  using (public.is_admin());


-- ---------------------------------------------------------------------------
-- 4. Create a profile automatically on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- 5. Members-only content
--
-- Lesson bodies live here rather than in the git repo, which is what makes the
-- gate real. A file committed to a public repo is readable by anyone no matter
-- what the site's UI does; a row behind this policy is not.
-- ---------------------------------------------------------------------------

create table if not exists public.lessons (
  id          bigint generated always as identity primary key,
  slug        text        not null unique,
  title       text        not null,
  summary     text,
  body_html   text        not null,
  published   boolean     not null default true,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.lessons enable row level security;

drop policy if exists "members read lessons"  on public.lessons;
drop policy if exists "admins manage lessons" on public.lessons;

create policy "members read lessons"
  on public.lessons for select
  using (published and public.is_member());

create policy "admins manage lessons"
  on public.lessons for all
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- 6. Make yourself the first admin
--
-- Sign up through the site first so the account exists, then run this line on
-- its own with your address. There is no other way in — by design, nothing in
-- the browser can grant the admin role.
-- ---------------------------------------------------------------------------

-- update public.profiles set role = 'admin' where email = 'you@example.com';


-- ---------------------------------------------------------------------------
-- 7. Optional starter content, so the members area is not empty
-- ---------------------------------------------------------------------------

insert into public.lessons (slug, title, summary, body_html, sort_order)
values (
  'welcome',
  'How to use the members area',
  'What lives behind the login, and why it lives here rather than in the repo.',
  '<p>The seven concept pages on the public site are the reference material. This ' ||
  'area is for anything that should not be world-readable.</p>' ||
  '<p>Content here is stored as database rows, not as files in the GitHub ' ||
  'repository. That distinction is the entire security model: a file in a public ' ||
  'repo can be read by anyone who knows the URL, regardless of what the website ' ||
  'shows. A row behind a row-level security policy cannot.</p>' ||
  '<p>Add or edit entries from the admin page, or directly in the Supabase table ' ||
  'editor.</p>',
  0
)
on conflict (slug) do nothing;
