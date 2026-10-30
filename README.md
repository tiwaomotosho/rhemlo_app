# Rhemlo

Little quests. Lasting light. A Scripture-memorisation study app (React 18 · Vite 5 · TypeScript · zustand · bun).

## Run

```bash
bun install
bun run dev        # http://localhost:5173
bun test           # grader parity tests
bun run selfcheck  # marks all ~51k items with their own answers; must report no failures
bun run build      # type-check + production build to dist/
```

## Deploy (Vercel)

Import the repo; framework preset **Vite**, build `bun run build`, output `dist`. `vercel.json` already carries the SPA rewrite and cache headers. No environment variables are needed.

## Data

`public/data/{AD2627,EN2627}` is generated from the Rhemlo bundle by `scripts/prep-data.py`
(`PYTHONUTF8=1 python scripts/prep-data.py <bundle>/rhemlo public/data`). Items are lazy-loaded per lesson.
`public/assets` is the Rhemlo asset pack (tokens, fonts, Glim, worlds, emblems). Keep file names and path patterns.

## Demo server (default) and switching to live

Until the real infrastructure exists, the app runs against a **demo server** that lives in the browser (`src/lib/backend/demo.ts`). It gives working sign-up/sign-in, sync, weekly leagues with promotion, the ranked daily challenge (with pending verification), friendly matches, Quiz Night (room `LAMP`), friends, co-op quests, a moderated circle with chat and reports, a coach workspace and a content studio. Other people and their activity are simulated and labelled "Demo server" in the app.

| Demo account | Role |
|---|---|
| `tiwa@demo.rhemlo.app` | Learner: Silver league, friends, co-op, Grace Youth Circle |
| `femi@demo.rhemlo.app` | Coach: circle dashboard, assignments, Quiz Night host screen |
| `ada@demo.rhemlo.app` | Content steward: item review, reports, pipeline |

Password for all three: `Rhemlo-demo-2026`. New accounts can also be created in onboarding.

To go live, set these in Vercel and redeploy (no code change):

```
VITE_RHEMLO_BACKEND=live
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

`src/lib/backend/live.ts` maps each call onto the RPCs in the bundle's `db/migrations` (0003–0006). Those migrations have never been deployed, so check each parameter name against them on first deploy.

## Offline, reminders and sound

- Offline lesson packs (You → Downloads) use the service worker, which is registered in production builds only. On Vercel (HTTPS) they work; locally use `bun run build` then `bunx vite preview`.
- Browser notifications are real: allow them after a sitting or in You → Notifications. Email reminders go to a demo outbox until the live server sends mail.
- Sounds are synthesised in the browser, off by default (You → Appearance).

## What is local-only

Progress, spaced-repetition boxes and the memory ladder live in `localStorage` (`rhemlo.v1`); export/restore is in **You**.
With the demo server, community features work but are simulated; they become real when the live backend is configured.

## Marking

`src/lib/grade.ts` ports `rhemlo.normalize.norm_text` and the reference parser. Marking never depends on difficulty, streaks or history.
