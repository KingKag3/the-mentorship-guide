-- ---------------------------------------------------------------------------
-- Let a member edit their own profile, without letting them promote themselves
--
-- Run this in the Supabase SQL editor. Idempotent, safe to re-run.
--
-- Until now `profiles` had exactly three write policies, all of them admin-only,
-- and a member could read their own row but change nothing on it. Adding a
-- self-service account page needs an UPDATE policy for the owner.
--
-- THE OBVIOUS VERSION OF THAT POLICY IS A PRIVILEGE ESCALATION.
--
--   create policy "update own profile" on public.profiles for update
--     using (id = auth.uid()) with check (id = auth.uid());
--
-- That is one statement away from any signed-in member running
--
--   update profiles set role = 'admin' where id = auth.uid();
--
-- and the row policy is perfectly happy with it: the row is theirs and it stays
-- theirs. Row-level security answers WHICH ROWS. It says nothing about WHICH
-- COLUMNS, and `role` is a column.
--
-- Column-level GRANTs are the usual Postgres answer and are wrong here, because
-- they are granted to the role `authenticated` - which admins also are. Revoking
-- UPDATE on `role` from `authenticated` would break the admin page too.
--
-- So the guard is a trigger. It is narrow on purpose: it has one opinion, about
-- one column, and every other field is left to the row policies above it.
-- ---------------------------------------------------------------------------


-- 1. The owner may update their own row -------------------------------------

drop policy if exists "update own profile" on public.profiles;

create policy "update own profile"
  on public.profiles for update
  using      (id = auth.uid())
  with check (id = auth.uid());


-- 2. ...but only an admin may change a role ----------------------------------
--
-- SECURITY DEFINER so it can call is_admin(), which reads profiles. Without it
-- the check would be evaluated under the caller's own policies and recurse -
-- the same reasoning as the role helpers in schema.sql.
--
-- `is distinct from` rather than `<>` so a null on either side still compares
-- correctly. role is NOT NULL today; relying on that from inside a security
-- guard is how a guard stops working when a column definition changes.

create or replace function public.guard_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an admin can change a role'
      using errcode = 'insufficient_privilege';
  end if;

  -- The primary key is a foreign key onto auth.users. Moving it would point a
  -- profile at a different account; the FK would catch most of it, but not all
  -- of it, and not with a message anyone could act on.
  if new.id is distinct from old.id then
    raise exception 'A profile cannot be moved to another account'
      using errcode = 'insufficient_privilege';
  end if;

  -- email is what the admin list and the account strip display. Letting it
  -- drift from the address the account actually authenticates with makes the
  -- admin page quietly untrue, so it is admin-only as well. This is a display
  -- concern rather than a security one, and is grouped here so there is one
  -- place to look for "what a member may not change".
  if new.email is distinct from old.email and not public.is_admin() then
    raise exception 'Only an admin can change the email on a profile'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_columns on public.profiles;

create trigger profiles_guard_columns
  before update on public.profiles
  for each row execute function public.guard_profile_columns();


-- ---------------------------------------------------------------------------
-- What this deliberately does NOT do
--
-- There is no admin path here for setting another user's password. That needs
-- `auth.admin.updateUserById`, which needs the service_role key, and that key
-- bypasses every policy in this file. It must never reach a browser, and this
-- site is static - everything it ships is a browser.
--
-- The admin page therefore sends a reset email instead, which needs only the
-- anon key and leaves the new password known to the member and to nobody else.
-- That is a better outcome than an admin-set password anyway; the only thing it
-- cannot do is rescue someone who has lost access to their email.
--
-- If that case ever needs solving it wants a Supabase Edge Function holding the
-- service key server-side, and that is a deliberate architectural decision to
-- be recorded in DECISIONS.md, not something to reach for quietly.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
--
-- Policies on profiles - expect four, including "update own profile":
--
--   select policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'profiles'
--    order by policyname;
--
-- The guard exists:
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--
-- And the test that matters, run as a MEMBER, not as the SQL editor's owner
-- role - it should fail with "Only an admin can change a role":
--
--   update public.profiles set role = 'admin' where id = auth.uid();
-- ---------------------------------------------------------------------------
