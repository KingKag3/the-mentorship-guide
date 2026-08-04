-- ===========================================================================
-- Invite codes
--
-- Run this in the Supabase SQL editor after schema.sql. Safe to re-run.
--
-- The point of this file is one function: redeem_invite(). It is the single
-- sanctioned path by which a profile's role can change without an admin doing
-- it by hand. Everything else about the security model is unchanged - there is
-- still no policy letting a user update their own profile row.
--
-- Why that matters: the function runs as its owner, so it can update profiles
-- even though the caller cannot. It hardcodes the role 'member'. A code can
-- therefore never mint an admin, whatever anyone sends it.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Codes
--
-- Codes are stored stripped of punctuation and upper-cased, so "k7m4p2qx" and
-- "K7M4-P2QX" are the same code. The UI adds the dashes back for legibility.
-- ---------------------------------------------------------------------------

create table if not exists public.invites (
  code          text        primary key,
  note          text,
  max_uses      int         not null default 1 check (max_uses > 0),
  uses          int         not null default 0,
  expires_at    timestamptz,
  revoked       boolean     not null default false,
  created_by    uuid        references auth.users on delete set null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

alter table public.invites enable row level security;

-- Only admins can see or touch codes. Nobody else can read the table at all -
-- which is what stops someone listing valid codes with the publishable key.
drop policy if exists "admins manage invites" on public.invites;

create policy "admins manage invites"
  on public.invites for all
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- 2. Redemption log
--
-- Kept separate so you can see who used what, even after a code is deleted.
-- ---------------------------------------------------------------------------

create table if not exists public.invite_redemptions (
  id          bigint generated always as identity primary key,
  code        text        not null,
  user_id     uuid        references auth.users on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (code, user_id)
);

alter table public.invite_redemptions enable row level security;

drop policy if exists "admins read redemptions" on public.invite_redemptions;

create policy "admins read redemptions"
  on public.invite_redemptions for select
  using (public.is_admin());


-- ---------------------------------------------------------------------------
-- 3. The redemption function
--
-- Returns jsonb rather than raising, so the browser can show a specific
-- message. Deliberately vague to the caller about *why* an unknown code
-- failed: 'invalid' covers both "no such code" and a typo, which gives a
-- brute-forcer nothing to work with.
--
-- Brute force is otherwise handled by entropy alone: codes are 16 characters
-- from a 31-character alphabet, about 2^79 possibilities. There is no rate
-- limit here, so do not shorten them.
-- ---------------------------------------------------------------------------

create or replace function public.redeem_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code   text;
  v_invite public.invites%rowtype;
  v_role   text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));

  if v_code = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select role into v_role from public.profiles where id = auth.uid();

  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  -- Already in. Do not burn a use on someone who does not need one.
  if v_role in ('member', 'admin') then
    return jsonb_build_object('ok', true, 'error', null, 'already_active', true);
  end if;

  -- Lock the row so two people redeeming the last use of a code cannot both
  -- succeed.
  select * into v_invite from public.invites where code = v_code for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if v_invite.revoked then
    return jsonb_build_object('ok', false, 'error', 'revoked');
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  if v_invite.uses >= v_invite.max_uses then
    return jsonb_build_object('ok', false, 'error', 'used_up');
  end if;

  update public.invites
     set uses = uses + 1,
         last_used_at = now()
   where code = v_code;

  -- The only role this function will ever grant.
  update public.profiles
     set role = 'member'
   where id = auth.uid();

  insert into public.invite_redemptions (code, user_id)
  values (v_code, auth.uid())
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

-- Functions are executable by everyone unless told otherwise. Signed-in users
-- only - an anonymous visitor has no profile to promote anyway, but there is
-- no reason to let them probe codes.
revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;
