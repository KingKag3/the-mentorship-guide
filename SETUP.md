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

4. Repeat with [`supabase/invites.sql`](supabase/invites.sql). That adds invite codes — see
   *Invite codes* below. Skip it if you would rather approve everyone by hand; the site works
   either way, though the admin page will show an error where the codes table should be.
5. Repeat with [`supabase/lesson-media.sql`](supabase/lesson-media.sql). That adds the video field
   and attachment links to entries. Without it the admin page will complain about `video_url`.
6. Repeat with [`supabase/storage.sql`](supabase/storage.sql). That creates the private
   `lesson-media` bucket for slides and PDFs, plus the cover image field.
7. Repeat with [`supabase/phases.sql`](supabase/phases.sql). That adds phases — the parts of the
   curriculum — and files any existing entries into a starter Phase 1. It depends on the files
   above.
8. Repeat with [`supabase/trades.sql`](supabase/trades.sql). That adds the `trades` table behind
   the journal and the statistics page, its row-level security, and the storage policies for
   trade screenshots. Run it last.

**All eight are required for a working install.** Skipping the last one leaves `journal.html` and
`stats.html` deployed but non-functional — they will report a missing table rather than fail
quietly, but nothing in Phase 1 works until it has been run.

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

Confirmation and password-reset emails contain links back to your site. If this step is skipped or
the path is wrong, those links land on a 404 and new members cannot get in.

1. Go to **Authentication** → **URL Configuration**.
2. Set **Site URL** to exactly:

   ```
   https://kingkag3.github.io/the-mentorship-guide/login.html
   ```

3. Under **Redirect URLs**, add:

   ```
   https://kingkag3.github.io/the-mentorship-guide/**
   ```

> **The path is the part that goes wrong.** `https://kingkag3.github.io` on its own is the root of
> the github.io domain, which belongs to a user-site repo that does not exist — GitHub serves its
> own 404 there and nothing in this repository can intercept it. The confirmation link will look
> correct in the email and dead on arrival. This has happened once already.
>
> Pointing **Site URL** at `login.html` rather than the site root is deliberate: that page already
> handles "already signed in, go through", so a member who has just confirmed lands somewhere that
> does something instead of on the public start page.

Changing this does not repair emails already sent — the URL is baked in when the message is
generated. Anyone stuck on a dead link needs a fresh confirmation from
**Authentication → Users → ⋯ → send confirmation email**.

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

## Invite codes

An alternative to approving each account by hand. You generate a code, send it to someone, and
they are let in the moment they use it.

**To send one:** open **admin** → *Invite codes*. Give it a label, decide how many people may use
it and when it expires, and press **Generate**. You get the code and a link. The link
(`…/login.html?invite=CODE`) opens the signup tab with the code already filled in, so they only
type an email and a password.

**What happens when it is used:** the browser calls a database function called `redeem_invite`.
That function checks the code exists, is not revoked, has not expired and has uses left, then
promotes the caller to `member` and records the redemption.

That function is the only path in the whole system that can change a role without an administrator
doing it. It matters that the check runs there and not in the page: a user still has no permission
to edit their own profile row, so they cannot promote themselves by fiddling with JavaScript.
**The function only ever writes `member`** — a code cannot mint an admin no matter what is sent to
it.

**Security properties worth knowing:**

- Codes are 16 characters from a 31-character alphabet, roughly 2^79 combinations. There is no
  rate limiting behind them, so that length *is* the defence. Do not shorten them.
- Nobody but an admin can read the `invites` table, so the publishable key cannot be used to list
  valid codes.
- An unknown code and a mistyped code return the same error, which tells a guesser nothing.
- The row is locked during redemption, so two people racing for the last use of a code cannot both
  succeed.
- Treat a code like a password. Send it directly; do not post it publicly.

**Revoking** kills a code immediately but does not remove anyone who already used it — change
their role in the accounts table for that.

---

## How the curriculum is structured

Three levels, like a book:

- **Phase** — a part of the curriculum. *Phase 1*, *Phase 2*. Has a title, an optional subtitle,
  and a sort order.
- **Entry** — a numbered chapter inside a phase. Numbering on the index comes from the sort order,
  counting only published entries, so a member never sees a gap where a draft sits.
- **Unfiled** — entries with no phase. They appear in their own section at the bottom of the index
  rather than disappearing, which is also where a deleted phase's entries end up.

The members area is two pages. `members.html` is the index — phases with their numbered entry
lists. `lesson.html?slug=…` is one entry on its own page, with previous/next links across the
phase and a breadcrumb showing where you are.

That split is deliberate. Rendering every entry on one page would mean a member downloads every
slide of every lesson on each visit, which is exactly the transfer budget problem described further
down. One page per entry loads only what is being read.

To reorder, change the sort numbers. To hide a whole phase from members without deleting it,
untick its **Published** box — its entries vanish from the index along with it.

---

## Videos and attachments

Each entry can carry one YouTube video, a formatted body, and a list of attachment links. All
three are edited from the admin page.

**Video.** Paste any YouTube URL — `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, with or without
a timestamp. The page extracts the id and renders a responsive `youtube-nocookie.com` embed, which
holds off on tracking cookies until the viewer presses play. A `?t=90` in the URL is honoured as a
start offset.

> **Embedding does not make a video private.** The file is served by YouTube, not by this site, so
> the member roles here have no reach over it. An **unlisted** video stays out of search and off
> your channel, but the URL sits in the page source and works for anyone who copies it. That is the
> ceiling on free YouTube. Genuinely private video needs a host with domain-locked playback (paid
> Vimeo) or signed URLs (Cloudflare Stream).

**Body.** A toolbar editor — headings, bold, italic, underline, strikethrough, code, quotes, lists,
links, images. The HTML it produces is run through DOMPurify before it is inserted on the members
page, so a careless paste cannot execute script on everyone else's browser.

**Discord markup is understood.** Paste plain text carrying `**bold**`, `## headings`, `> quotes`,
`- bullets`, `` `code` ``, ```` ``` ```` fences or `[label](url)` links and it arrives formatted.
For text already typed into the editor, select it and press *convert Discord markup*.

Two things to know about the dialect. Discord reads `__text__` as **underline**, where standard
markdown would call it bold — the converter follows Discord, because getting that backwards
silently changes how a lesson reads. And spoilers (`||text||`) have no equivalent here, so the
markers are dropped and the text kept rather than the content disappearing.

If you copy from the Discord app or the web client, the clipboard usually carries real formatting
already, and that is used in preference to reconstructing it from the characters. The converter
only steps in for plain text. To force it, paste with Ctrl+Shift+V and then press the convert
button.

**Slides and images.** The image button in the editor uploads rather than embedding. Pick a file
and it is resized to 1600px wide, converted to WebP and pushed to the private bucket; the body
stores the storage path, not a URL. Screenshots typically drop by five to ten times with no visible
loss.

That path matters: a signed URL written into the database would expire within the hour and leave
the lesson full of broken pictures. The page signs them fresh on every render instead.

**Cover image and phase.** Optional. The cover renders full width under the title; the phase shows
as a small tag above it — the equivalent of the banner and `Phase 1` label on a Discord post.

**Downloads.** Two kinds per entry:

- **Uploaded files** — PDFs, spreadsheets, images. Stored in the private bucket. Members get a
  signed link that stops working after an hour; a non-member gets nothing at all. **This is the one
  part of a lesson that is genuinely gated** — unlike the video, and unlike anything hosted
  elsewhere.
- **External links** — anything on another service. Access is governed by that service, not by
  roles here: a publicly shared Drive file stays public.

A note on Discord specifically — **`cdn.discordapp.com` file links expire.** They carry signed
`ex`/`is`/`hm` parameters and stop resolving after roughly a day, so they are useless as permanent
attachments. Upload the file here instead. If you want to link to a discussion, link to the channel
or message (`discord.com/channels/…`) — that is durable, and access follows server membership.

**Watch the storage budget.** The free tier gives roughly 1GB of files and about 5GB of transfer a
month; check the current figures, they move. A lesson built from a dozen compressed slides plus a
PDF lands around 1–2MB, so storage is unlikely to be the limit — transfer is. Every member reading
that lesson pulls the images again. If the members area gets busy, that is the number that runs out
first, and it is what the automatic compression is there to stretch.

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
