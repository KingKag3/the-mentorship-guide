# Deploying the bar fetch

The first server-side code in this project. Everything else is a static page talking to Postgres, so
this needs a tool the repo has never used: the Supabase CLI.

**Nothing on the site breaks if this is never deployed.** The chart falls back to drawing fills with
no candles, which is the view members without NQ or ES trades get anyway.

---

## Once

1. Install the CLI — <https://supabase.com/docs/guides/local-development/cli/getting-started>. It is
   a single binary; on Windows, `scoop install supabase` or the installer from that page. This does
   **not** add a build step to the site: the CLI is a deploy tool, not a dependency, and nothing in
   `.html` or `.js` knows it exists.

2. Sign in and point it at the project:

   ```bash
   supabase login
   supabase link --project-ref djqpgdchknwgmjmkagnr
   ```

3. Run `supabase/market-bars.sql` in the SQL editor if it has not been run. The function calls
   `bar_sessions_wanted`, which that file creates.

## Deploy

Either paste the file into the dashboard's function editor (**Edge Functions → Deploy a new
function → via editor**, named `fetch-bars`, entry file `index.ts`), or from the repo root:

```bash
supabase functions deploy fetch-bars
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform — do not set them, and
do not put the service key anywhere in this repo.

## Set FETCH_BARS_SECRET, or nothing can call it

**Edge Functions → Secrets**, add `FETCH_BARS_SECRET` with any long random string. That value is
what the caller sends as its bearer token.

**Why a secret of your own rather than the project's service key.** The first version accepted only
the injected `SUPABASE_SERVICE_ROLE_KEY`, and refused every call on the project it was written for.
Supabase has two generations of keys — the JWT-shaped `eyJ…` and the newer `sb_secret_…` — and on a
project that has moved, the value the platform injects is simply a different string from the one its
owner copies out of the dashboard. Nothing is wrong with either key; they are not equal, which is
all the comparison was asking. A secret you set is the same string on both sides by construction.

The old path still works where it works: the injected service key is accepted too, as is a
signed-in admin's JWT.

## Turn off "Verify JWT" for this function — it will not work until you do

Supabase's gateway validates the Authorization header before your code runs, and accepts only a JWT
for this project. `FETCH_BARS_SECRET` is a random string, so the gateway answers:

```
HTTP/1.1 401 Unauthorized
sb-error-code: UNAUTHORIZED_INVALID_JWT_FORMAT
{"code":"UNAUTHORIZED_INVALID_JWT_FORMAT","message":"Invalid JWT"}
```

and the function never boots — the logs stay empty, because nothing ran. **That header is how you
tell this apart from the function refusing you.** A refusal from the function says
`{"error":"not allowed"}` and names the shape of the token it got; a refusal from the gateway
carries `sb-error-code` and never reaches the log.

Two ways to turn it off:

- **Dashboard:** open the function, find its settings, and turn off *Verify JWT* (it may be worded
  "Verify JWT with legacy secret"). Redeploy afterwards if the dashboard asks.
- **CLI:** it is already set in `supabase/config.toml` in this repo, so
  `supabase functions deploy fetch-bars` carries it. This is the reliable route when the toggle
  cannot be found in the dashboard.

**This is not a loosening.** What the gateway would protect is already protected: the function
checks every caller itself — the shared secret, the platform's service key, or a signed-in admin's
JWT read against `profiles.role` — and answers 401 to anything else. The gateway was a second lock
that only turned away the right key.

## Try it before scheduling it

One session, by hand. Replace the key and pick a day you traded NQ or ES:

```bash
curl -X POST https://djqpgdchknwgmjmkagnr.supabase.co/functions/v1/fetch-bars \
  -H "Authorization: Bearer <FETCH_BARS_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"NQ","day":"2026-09-16"}'
```

On Windows use `curl.exe`, not PowerShell's `curl` alias, and escape the quotes:
`-d "{\"symbol\":\"NQ\",\"day\":\"2026-09-16\"}"`. `Invoke-RestMethod` works too but hides the
response body on an error, which is exactly when you need it.

Expect `{"ran":[{"symbol":"NQ","day":"2026-09-16","status":"ok","bars":276}]}`. A full Globex
session of 5-minute bars is about 276 of them; a number far below that means the window is wrong,
not that the day was quiet.

Then check the bars look like a session rather than a fragment:

```sql
select min(ts), max(ts), count(*) from public.market_bars
 where symbol = 'NQ' and ts >= now() - interval '7 days';
```

`min` should be around 22:00 UTC the evening before, `max` around 21:00 UTC on the day (an hour
earlier for both in winter).

## Then schedule it

Run `supabase/market-bars-schedule.sql`, including the vault step inside it.

---

## When it goes wrong

It will. The source is unofficial and free — `supabase/market-bars.sql` explains why that was
accepted and what it costs.

```sql
select * from public.bar_fetch_log where status = 'failed' order by trading_day desc;
```

`last_error` carries the reason. Retry one day without waiting for the night:

```bash
curl -X POST .../functions/v1/fetch-bars \
  -H "Authorization: Bearer <FETCH_BARS_SECRET>" -H "Content-Type: application/json" \
  -d '{"symbol":"NQ","day":"2026-09-16","force":true}'
```

`force` is only needed for a day already recorded `ok` or `empty`; a `failed` day is retried by the
next nightly sweep on its own.

An admin signed into the site can call it with their own JWT instead of the secret — the function
checks `profiles.role`, and answers CORS preflight so a browser call works. Members cannot call it
at all.

**Failure modes worth recognising:**

| `last_error` | What it means |
| --- | --- |
| `source answered 429` | Rate-limited. It usually clears by itself; the next sweep retries. |
| `source answered 404` | The ticker changed, or the day is outside the history window. |
| `source returned no result block` | An HTML page came back instead of JSON — a consent or block page. |
| `write failed: …` | Postgres refused. Nothing to do with the source; read the message. |

A `401` with `{"error":"not allowed"}` is not a fetch failure and never reaches the log: the call was
turned away at the door. The body names the shape of the token it was sent — its first three
characters and its length — and the function logs the same line along with whether
`FETCH_BARS_SECRET` is set at all. That is enough to tell "wrong key" from "no secret configured"
without printing a credential.

A day recorded `empty` is settled — a holiday, or older than the roughly sixty days of intraday
history the source keeps — and is not asked for again. If that is wrong, `force` it.
