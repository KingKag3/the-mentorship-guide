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

From the repo root:

```bash
supabase functions deploy fetch-bars
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform — do not set them, and
do not put the service key anywhere in this repo.

## Try it before scheduling it

One session, by hand. Replace the key and pick a day you traded NQ or ES:

```bash
curl -X POST https://djqpgdchknwgmjmkagnr.supabase.co/functions/v1/fetch-bars \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"NQ","day":"2026-09-16"}'
```

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
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" -H "Content-Type: application/json" \
  -d '{"symbol":"NQ","day":"2026-09-16","force":true}'
```

`force` is only needed for a day already recorded `ok` or `empty`; a `failed` day is retried by the
next nightly sweep on its own.

An admin signed into the site can call it with their own JWT instead of the service key — the
function checks `profiles.role`. Members cannot call it at all.

**Failure modes worth recognising:**

| `last_error` | What it means |
| --- | --- |
| `source answered 429` | Rate-limited. It usually clears by itself; the next sweep retries. |
| `source answered 404` | The ticker changed, or the day is outside the history window. |
| `source returned no result block` | An HTML page came back instead of JSON — a consent or block page. |
| `write failed: …` | Postgres refused. Nothing to do with the source; read the message. |

A day recorded `empty` is settled — a holiday, or older than the roughly sixty days of intraday
history the source keeps — and is not asked for again. If that is wrong, `force` it.
