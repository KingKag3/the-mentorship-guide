# Setting up accounts and the admin page

The site works without any of this — the seven concept pages are plain static files. This guide
only covers the login, the members area, and the admin page.

Budget about fifteen minutes. Everything below is on Supabase's free tier.

---

## What you are actually building

| Piece | Where it lives | Who can read it |
| --- | --- | --- |
| The seven concept pages | Files in this public repo | Everyone, always |
| Accounts and roles | Supabase database | Only the account owner, plus admins |
| Members-only entries | Supabase database (`lessons` table) | Approved members and admins only |

The split matters. **A file committed to a public repo is readable by anyone who knows the
address**, whatever the website's UI does — so gating the concept pages would be decorative, and
this setup does not attempt it. Anything genuinely private has to live in the database, which is
what the members area does.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> and sign up. The free tier is enough.
2. Create a new project. Choose a region near you and set a strong database password —
   **write it down**, it is not recoverable and you will not use it day to day.
3. Wait for the project to finish provisioning, usually a minute or two.

## 2. Create the tables and security policies

1. In the Supabase dashboard, open **SQL Editor** → **New query**.
2. Open [`supabase/schema.sql`](supabase/schema.sql) from this repo, copy the whole file, paste it
   in, and press **Run**.
3. You should see a success message. The script creates the `profiles` and `lessons` tables, the
   role-checking functions, the row-level security policies, and a trigger that creates a profile
   row whenever someone signs up.

The script is safe to run more than once.

## 3. Wire the site to the project

1. In Supabase, go to **Project Settings** → **API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `supabase-config.js` in this repo and paste both values in.
4. Commit and push.

```bash
git add supabase-config.js && git commit -m "Connect Supabase project" && git push
```

> **On committing the anon key:** this is correct and intended. The anon key is designed to ship
> in client-side code; it grants nothing on its own, because every table is protected by row-level
> security policies enforced on Supabase's servers.
>
> The **`service_role`** key is the opposite. It bypasses every policy. Never put it in this repo,
> in a browser, or anywhere a user could reach it. Nothing on this site needs it.

## 4. Point Supabase at the live site

Confirmation and password-reset emails contain links back to your site. If this step is skipped,
those links go nowhere.

1. Go to **Authentication** → **URL Configuration**.
2. Set **Site URL** to `https://kingkag3.github.io/ict-mentorship-guide/`
3. Under **Redirect URLs**, add:
   - `https://kingkag3.github.io/ict-mentorship-guide/login.html`
   - `https://kingkag3.github.io/ict-mentorship-guide/members.html`

## 5. Make yourself the admin

There is no back door for this on purpose — nothing in the browser can hand out the admin role.
It has to be done once, in SQL.

1. Go to the live site, open **sign in** → **create account**, and sign up with your own address.
2. Check your email and click the confirmation link.
3. Back in the Supabase **SQL Editor**, run this with your address:

```sql
update public.profiles set role = 'admin' where email = 'kingkag3@proton.me';
```

4. Reload the site. An `admin` badge appears in the header and the admin page opens.

## 6. Let people in

New signups land on `pending` and can see nothing. To approve someone, open **admin**, find them
in the accounts table, and change their role to `member`.

Three roles exist:

| Role | Can do |
| --- | --- |
| `pending` | Nothing. Sees an "awaiting approval" notice. |
| `member` | Read published members-only entries. |
| `admin` | Everything, plus manage accounts and entries. |

---

## Optional hardening

Worth doing if the site is public and you do not want strangers creating accounts.

**Close public signups.** Authentication → Providers → Email → turn off *Allow new users to sign
up*. You then add people yourself with Authentication → Users → **Invite**. The sign-up tab on
`login.html` will start returning an error, which is the intended behaviour.

**Turn on leaked-password protection.** Authentication → Policies (or Providers → Email) → enable
the compromised-password check. It refuses passwords found in known breach lists.

**Require a longer minimum password.** The default is six characters. Eight or more is better; the
sign-up form on this site already asks for eight.

**Keep an eye on email rate limits.** The free tier's built-in mailer is limited and not intended
for production volume. If you expect real signup traffic, connect your own SMTP provider under
Authentication → Emails.

---

## Things this setup deliberately does not do

- **It does not delete logins.** The admin "remove" button deletes the profile row, which revokes
  access instantly, but the underlying auth user survives. Deleting that requires the privileged
  key, which is intentionally absent. Erase accounts fully in Authentication → Users.
- **It does not email people when approved.** Approval is silent; tell them yourself, or add a
  Supabase Edge Function later if you want notifications.
- **It does not protect the seven concept pages.** See the top of this file.
- **It does not sanitise the entry body field.** The admin page accepts raw HTML for entry bodies
  so you can format them, and inserts it as markup. Only admins can write there. Do not paste HTML
  you did not write.

---

## If something breaks

**"Supabase is not configured yet"** — `supabase-config.js` still has the placeholder values, or
the push has not gone live yet. GitHub Pages can take a minute.

**Sign-in works but the members area says "awaiting approval"** — that is correct for a new
account. Set the role to `member` in the admin page, or run the SQL in step 5 for admin.

**Admin page redirects to login even though you are signed in** — your profile row exists but the
role is not `admin`. Re-run the SQL in step 5 and check the email matches exactly.

**Confirmation email link lands on a 404** — step 4 was skipped or the URLs have a typo.

**Nothing loads and the browser console shows a CORS or 401 error** — the URL or anon key was
pasted wrong. Copy them again from Project Settings → API.
