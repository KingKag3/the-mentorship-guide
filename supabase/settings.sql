-- ===========================================================================
-- Site settings
--
-- Run in the Supabase SQL editor after schema.sql. Safe to re-run.
--
-- A key/value store for the handful of things an admin should be able to
-- change without a commit and a deploy. Currently: the install walkthrough
-- video on the indicators page.
--
-- Deliberately small. Anything structural belongs in a real column on a real
-- table; this is for values that are genuinely just a string, where adding a
-- table per setting would be worse than the setting itself.
-- ===========================================================================


create table if not exists public.settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists "members read settings"  on public.settings;
drop policy if exists "admins manage settings" on public.settings;

-- Members and admins only. Every key so far drives a members-only page, and a
-- setting that needs to be world-readable can get its own policy when one
-- exists rather than opening the whole table now.
create policy "members read settings"
  on public.settings for select
  using (public.is_member());

create policy "admins manage settings"
  on public.settings for all
  using (public.is_admin())
  with check (public.is_admin());


-- Keep updated_at honest without trusting the client to send it.
create or replace function public.touch_setting()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists settings_touch on public.settings;

create trigger settings_touch
  before update on public.settings
  for each row execute function public.touch_setting();


-- ---------------------------------------------------------------------------
-- The keys in use. Inserted empty so the admin form has a row to edit and the
-- page has something to read rather than a missing-key branch.
-- ---------------------------------------------------------------------------

insert into public.settings (key, value) values
  ('install_video_url', null)
on conflict (key) do nothing;
