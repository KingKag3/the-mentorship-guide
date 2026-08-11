-- ===========================================================================
-- Say what kind of account this is
--
-- Run in the Supabase SQL editor after prop-accounts.sql. Safe to re-run.
--
-- The table was built assuming every account is an evaluation or a funded
-- account with something to reach. A live account has no target, no drawdown
-- set by anybody else, and cannot be passed or failed — it is simply money.
--
-- WHY A COLUMN AND NOT AN INFERENCE
--
-- The obvious shortcut is "no profit target means it is a live account". That
-- conflates two states that need different handling: an account nobody has set
-- up **yet**, and an account that will never have a target. The first wants
-- prompting, the second wants leaving alone, and a page that cannot tell them
-- apart will nag forever about a personal account or quietly ignore an
-- evaluation.
--
-- `DECISIONS.md`, 5 August, records the same lesson from the statistics page:
-- an empty state has to say which kind of empty it is.
--
-- ON THE TABLE NAME
--
-- `prop_accounts` now holds accounts that are not prop accounts. The name is
-- narrower than the contents and that is a small debt, taken knowingly: a
-- rename touches the page, the migration hints and every document that names
-- it, to buy a word. Recorded here so the next reader finds an explanation
-- rather than a puzzle.
-- ===========================================================================


alter table public.prop_accounts
  add column if not exists kind text not null default 'prop';

-- Added separately so re-running is safe: `add column ... check` would fail the
-- second time, and a named constraint can be dropped and recreated.
alter table public.prop_accounts
  drop constraint if exists prop_accounts_kind_check;

alter table public.prop_accounts
  add constraint prop_accounts_kind_check
  check (kind in ('prop', 'live', 'demo'));

comment on column public.prop_accounts.kind is
  'prop: an evaluation or funded account with a target and a drawdown set by a '
  'firm. live: your own money, no target, cannot be passed or failed. demo: '
  'practice, kept separate so it never lands in a real total.';


-- ---------------------------------------------------------------------------
-- What it did
-- ---------------------------------------------------------------------------

-- select kind, count(*) from public.prop_accounts group by kind;
