# Rhemlo database (Supabase)

`migrations/0001`–`0006` come from the Rhemlo bundle (content, question bank, progress, manual library,
organisations, community and play). `0007_app_api.sql` is the web app's server API: every function the app
calls is named `app_*` and returns exactly what its screen needs; internal helpers are `rh_*`.

| Area | What 0007 adds |
|---|---|
| Accounts | A profile and a public handle for every sign-up (trigger on `auth.users`); `app_me` gives the app its role: admin, steward, coach or learner |
| Sync | `user_snapshots` (one per learner; the app merges safely). Each push also records sittings per day, lessons cleared and the Secure count for co-op, circles and coaches. Never answers or cards. |
| Leagues | Weekly tier leagues (Bronze → Lantern) from server-verified points; closed every Monday by `rh_close_tier_week()` |
| Daily challenge | Marked on the server, one attempt, 10 points per right answer; only lessons whose printed date has passed |
| Community | Friends, feed, cheers, co-op, circles and class chat, assignments, coach-set mocks and submissions, inbox, direct messages (0006 safeguards), guardian consent requests, leaderboards, private leagues, hosted rooms and friendly duels |
| Administration | Manual catalogue (publish, license, retire), seasons, organisations, consents, sanctions, user and content reports, item verification, anomalies |
| Email | `email_outbox`, sent by the `send-mail` Edge Function |

## Deploy (staging first, then production)

1. **Create the project** (supabase.com → New project). Note the project ref, the URL and the anon key.
2. **Enable extensions** (Database → Extensions): `pg_cron` and `pg_net`, **before** step 3, so 0007 schedules
   its jobs. (If you enable them later, run the `cron.schedule` block at the end of 0007 by hand.)
3. **Run the migrations:**
   ```
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
4. **Load the manuals and the KJV** with the bundle's loader, using the database connection string
   (Project Settings → Database → Connection string, *session* pooler, port 5432). Run it from the bundle folder:
   ```
   set DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
   set PYTHONPATH=src
   python -m rhemlo.cli load --manual manuals/AD2627
   python -m rhemlo.cli load-items --manual manuals/AD2627
   python -m rhemlo.cli publish --manual manuals/AD2627
   (repeat the three lines for manuals/EN2627)
   python -m rhemlo.cli load-bible
   ```
5. **A first season per manual** (SQL editor):
   ```sql
   insert into seasons (edition_code, name, starts_at, ends_at, status)
   select code, 'Season 2026–27', '2026-09-06', '2027-08-30', 'active' from editions where status = 'published';
   ```
6. **Staff roles** (after those people have signed up once):
   ```sql
   insert into platform_staff (user_id, role)
   select id, 'super_admin' from auth.users where email = 'you@yourchurch.org';      -- admin console
   insert into platform_staff (user_id, role)
   select id, 'content_editor' from auth.users where email = 'steward@yourchurch.org'; -- content studio
   ```
   Roles: `super_admin` (everything), `moderator` (reports, sanctions), `support` (consents, people),
   `content_editor` (manuals, verification, anomalies).
7. **Classes and coaches:**
   ```sql
   insert into groups (edition_code, name, join_code) values ('EN2627', 'Grace Youth', 'GRACE-YOUTH');
   insert into group_members (group_id, user_id, role)
   select g.id, u.id, 'coach' from groups g, auth.users u where g.join_code = 'GRACE-YOUTH' and u.email = 'coach@yourchurch.org';
   ```
   Learners join with the code in the app (Circle → Circles). Optional settings on a group:
   `{"weekly_goal": 200, "quiz_night": {"weekday": 5, "time": "19:00"}, "quiz_room": "LAMP"}`.
8. **Sign-in settings** (Authentication → URL configuration): Site URL = your address; add
   `https://<your-domain>/auth/callback` and your preview URLs to the redirect list. Set up SMTP (Resend or Postmark).
9. **Email sender:**
   ```
   npx supabase functions deploy send-mail --no-verify-jwt
   npx supabase secrets set RESEND_API_KEY=<key> MAIL_FROM="Rhemlo <no-reply@mail.your-domain>" CRON_SECRET=<random>
   ```
   then schedule it (SQL editor):
   ```sql
   select cron.schedule('rhemlo-send-mail', '*/5 * * * *', $$
     select net.http_post(url := 'https://<ref>.supabase.co/functions/v1/send-mail',
                          headers := '{"x-cron-secret": "<same random>"}'::jsonb) $$);
   ```
10. **Point the app at it** (Vercel → Environment Variables), then redeploy:
    `VITE_RHEMLO_BACKEND=live`, `VITE_SUPABASE_URL=https://<ref>.supabase.co`, `VITE_SUPABASE_ANON_KEY=<anon key>`.

Never put the `service_role` key in the app, in Vercel or in Git.

## Test locally

`tests/run_local.sh` builds a throwaway database from every migration, loads both manuals with the bundle's
loader, and runs the bundle's behaviour and community checks, the app API checks (`tests/app_api_test.sql`)
and the live adapter contract test (`tests/live_contract.ts`, which drives `src/lib/backend/live.ts` and the
social adapter through a PostgREST-like stand-in). It needs PostgreSQL 16, Python with `psycopg`, and Bun.

```
PGBIN=/path/to/pgsql/bin BUNDLE=/path/to/rhemlo PGPORT=54329 PGUSER=postgres bash supabase/tests/run_local.sh rhemlo_test
```

Use a UTF-8 locale (the script creates the database with `en-US`); marking treats letters such as ē as letters.

## Known limits

- Live rooms poll the server once a second. Fine for classes and parish rooms; for very large events, switch
  the room screen to Supabase Realtime (0006 already publishes `matches`, `match_players`, `messages`, `inbox`).
- Passkeys and push notifications are demo-only and are hidden in live mode. Reminders still work in the open app.
- Practice is marked on the device and synced as a snapshot; only the daily challenge and live play are marked
  on the server, which is why only they earn ranking points.
