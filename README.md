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

## What is local-only

Progress, spaced-repetition boxes and the memory ladder live in `localStorage` (`rhemlo.v1`); export/restore is in **You**.
Arena rankings, Quiz Night, Circle (friends, chat, co-op), coach/steward workspaces and sync need a backend and accounts; those screens are honest shells for now.

## Marking

`src/lib/grade.ts` ports `rhemlo.normalize.norm_text` and the reference parser. Marking never depends on difficulty, streaks or history.
