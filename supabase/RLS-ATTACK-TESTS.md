# Attacking the policies, with two accounts

Every migration in this project has been confirmed to **exist**. Almost none has been confirmed to
**refuse** anybody, and those are different claims — the first is a shape, the second is the whole
point.

**The SQL editor cannot run any of these.** It connects as the table owner, and row-level security
does not apply to the owner: a `select` there returns every member's rows and an `insert` there
succeeds whatever the policy says. A test run in the editor proves nothing about a policy and looks
exactly like a test that passed. That is recorded at the top of `RUN-THESE.md` and it is the reason
this file exists.

So it needs two signed-in browser sessions, and the only way to get them side by side is a normal
window and a private one.

---

## Setting up, once

1. In a **private window**, go to the site and sign up as a second member —
   any address you can receive mail at. Call this account **B**.
2. Leave **A** (`kingkag3@proton.me`, admin) signed in in the normal window.
3. Confirm B's role in the SQL editor. B must be a plain member, not an admin —
   the whole point is testing what a non-admin cannot do:

   ```sql
   select id, email, role from public.profiles order by created_at desc limit 5;
   ```

   If B has no row or the wrong role, fix that before going on, or every test
   below will pass for the wrong reason.

4. As **B**, log one trade in the journal. Anything will do. This is the object
   A will try to reach.

**Read the errors carefully.** A row-level security refusal is `42501` / *new row violates
row-level security policy*. An empty result — `200 []` — is also a pass for a read test, and is not
the same as an error. Four earlier attempts at this were fooled by errors that looked like passes;
`HANDOVER.md` has the list.

---

## Test 1 — an admin writing on a trade nobody shared

**This one is predicted to FAIL, and finding that out is the point of running it.**

Reading the policies rather than testing them:

```sql
-- trades: correctly narrow
create policy "admins read shared"
  on public.trades for select
  using (shared_with_mentor and public.is_admin());

-- trade_reviews: no sharing condition at all
create policy "admins write reviews"
  on public.trade_reviews for insert
  with check (public.is_admin() and author_id = auth.uid());
```

An admin cannot **read** an unshared trade. Nothing stops them **writing a review on one**, given
its id — and an id is not a secret, it is a uuid that was visible for as long as the trade was
shared. So a member who shares a trade, gets an answer, and unshares it has withdrawn nothing: the
mentor can still write, and the reply appears in that member's journal.

**Steps.** As B, log a trade and do **not** tick *ask the mentor*. Get its id from the SQL editor:

```sql
select id, shared_with_mentor from public.trades
 where user_id = '<B''s id>' order by created_at desc limit 3;
```

Then, as **A** in the browser console on any signed-in page:

```js
const { error } = await supabase.from('trade_reviews')
  .insert({ trade_id: '<the unshared id>', body: 'attack test' });
console.log(error ?? 'WROTE IT — the policy did not refuse');
```

* **Refused (`42501`)** — the policy is narrower than it reads. Record it and move on.
* **Wrote it** — confirmed. The fix is one policy, below.

**The fix, if it writes.** Narrow the insert to match the read:

```sql
drop policy if exists "admins write reviews" on public.trade_reviews;
create policy "admins write reviews"
  on public.trade_reviews for insert
  with check (
    public.is_admin() and author_id = auth.uid()
    and exists (select 1 from public.trades t
                 where t.id = trade_id and t.shared_with_mentor)
  );
```

Note what that costs: a mentor can no longer answer a trade the member unshared **while they were
typing**. That is the right trade — the member withdrew consent — but it will read as a bug the
first time it happens, so the reply box should say so rather than showing a bare failure.

---

## Test 2 — a member reading somebody else's reply

As **A**, answer one of B's shared trades in the Review tab. Then as **B**, in the console:

```js
const { data, error } = await supabase.from('trade_reviews').select('id, body');
console.log(data, error);
```

* **Pass:** B sees only replies on B's own trades. The reply A wrote on B's trade **should** appear —
  that is the feature. What must not appear is any reply on a trade belonging to A or anyone else.
* To make that meaningful, A must also have a trade with a reply on it. If A has none, this test
  cannot fail and has proved nothing.

The policy under test:

```sql
create policy "read reviews on own trades"
  on public.trade_reviews for select
  using (exists (select 1 from public.trades t
                  where t.id = trade_id and t.user_id = auth.uid()));
```

---

## Test 3 — a member writing into another member's avatar folder

The storage policy keys on the second path segment being the caller's own id. As **B**, in the
console:

```js
const { error } = await supabase.storage.from('lesson-media')
  .upload('avatars/<A''s user id>/attack.png',
          new Blob(['x'], { type: 'image/png' }));
console.log(error ?? 'UPLOADED — the folder is not private');
```

* **Pass:** an error mentioning row-level security or "not authorized".
* **Fail:** it uploads. Delete it immediately and narrow the policy.

Then the control, so a pass means something: the same call into **B's own** folder must succeed.
Without the control, a refusal is equally consistent with the bucket being broken.

---

## Test 4 — a member reading the mentor's dismissals

Every policy on `trade_review_dismissals` is `is_admin()`, so a member should get nothing at all —
not their own rows, nothing. As **B**:

```js
const { data, error } = await supabase.from('trade_review_dismissals').select('*');
console.log(data, error);
```

* **Pass:** `[]` with no error. The table exists, the policy holds, and B is outside it.
* **Fail:** any row.

`200 []` is the pass here. A `404 PGRST205` would mean the table is missing and the test proved
nothing — which is the failure mode that has fooled this project before.

---

## Recording the result

Whatever happens, write it into the **Verified by attack** section of `HANDOVER.md` with the date
and what was actually observed — not "tested and fine". The value of that section is that it says
what was seen, including the errors that looked like passes and were not.

A test that was run and not written down will be run again in three months by somebody who does not
know it was run.
