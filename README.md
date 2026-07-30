# Gym Tracker

Log workouts (sets · reps · weight), plan your weekly split, and watch your progress over time. Built with Expo (React Native + web) and Supabase.

## Features

- **Today** — your training-day exercises with one-tap logging, plus a weekly summary (sessions, volume, exercises).
- **Weekly Plan** — build training days (Push / Pull / Legs / Upper / Lower / Full Body) and stack exercises with target sets × reps.
- **Exercises** — a curated library with step-by-step technique, coaching cues, and **common mistakes → how to fix them**. Filter by muscle group, split day, and equipment.
- **Progress** — filter your history by **exercise type, date range, and split day**. See per-exercise progress status (progressing / plateaued / new), auto-detected personal records, a mini progress chart, and a full timeline.
- **Coach summary** — every workout you save is sent to a Supabase edge function that writes a one-line motivational note about that session, shown under the entry in Recent activity.

## Coach summary (edge function)

`supabase/functions/workout-summary` takes `{ exercise, sets: [{reps, weight}], notes, splitDay }`,
asks OpenRouter for 1–2 grounded sentences about the session, and returns `{ summary, model }`.
It needs an `OPENROUTER_API_KEY` secret on the Supabase project.

Saving a workout triggers it automatically — no button, no setup step. `App.js` hands
the freshly inserted row to `summarizeWorkout()` (`src/lib/coach.js`), which invokes the
function and writes the reply to `workout_logs.ai_summary`, so the blurb stays under the
entry on later visits instead of being regenerated on every load. While it's in flight the
entry shows "Coach is writing your summary…"; if it fails the workout is still saved.

Model selection is env-driven on the function:

- `OPENROUTER_MODELS` — comma-separated, tried in order until one returns prose.
  Defaults to `google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free`.

**Free tier only** — no paid model is attempted, so the function never needs OpenRouter
credits. To use a paid model, put it first in `OPENROUTER_MODELS` (e.g.
`anthropic/claude-haiku-4.5,google/gemma-4-26b-a4b-it:free`) and fund the account.
Models are pinned rather than using `openrouter/free`, whose random routing lands on
classifiers and reasoning models that return no prose.

Deploy after edits:

```bash
npx supabase functions deploy workout-summary --project-ref yijxsityqkuchmjzpggi
```

## Demo stage — no login

There is no sign-up or sign-in screen. On first launch the app silently creates a
**Supabase anonymous session** and stores it on the device, so you land straight on
Today. Nothing to remember, nothing to type.

What this means in practice:

- Your plan and any workouts you log are **private to that device** — the anonymous
  user id is the owner, and Row Level Security enforces it.
- **Three sample workouts are shared with everyone.** They use the same
  `user_id IS NULL` convention the `exercises` library already uses: the row belongs
  to nobody, so every visitor can read it, and the insert/update/delete policies
  (`user_id = auth.uid()`) mean nobody can edit or delete it. New visitors land on a
  populated app instead of an empty one.
- The session persists across restarts. Clearing app storage (or a browser's site
  data) starts a fresh, empty account — the old rows are orphaned, not visible.
- There's no cross-device sync while anonymous. Adding email/password back later is
  just a login screen plus `supabase.auth.linkIdentity()` to keep existing data.

Requires **Anonymous sign-ins** to be enabled in the Supabase dashboard under
Authentication → Sign In / Providers. If it's off, the app says so on launch
instead of failing silently.

## Data & privacy

- Storage is **Supabase (cloud)** — plans and logs are backed up server-side.
- Every table has **Row Level Security** tied to your user id: you can only read/write your own plans and logs. The exercise library is shared read-only.

## Run it

```bash
npm install
npm run web      # or: npm run ios / npm run android
```

Config lives in `.env` (copy from `.env.example`). The Supabase URL and publishable key are safe to expose — they only work through Row Level Security.

## Project layout

- `App.js` — demo session bootstrap + bottom-tab navigation + detail/log overlays
- `src/lib/supabase.js` — Supabase client + `ensureDemoSession()` (anonymous sign-in)
- `src/lib/db.js` — all data access (exercises, plan, logs)
- `src/lib/coach.js` — calls the `workout-summary` edge function and saves its reply
- `supabase/functions/workout-summary/` — the edge function (Deno + OpenRouter)
- `src/lib/metrics.js` — volume, estimated 1RM, PR detection, progress status
- `src/screens/` — Today, Plan, Library, ExerciseDetail, Progress
- `src/components/` — Button, Chip, Tag, ExerciseRow, ExercisePicker, LogSheet

## Database

Tables (all with RLS): `exercises`, `plan_days`, `plan_exercises`, `workout_logs` (sets stored as JSONB, coach blurb in `ai_summary`). Schema and the seeded exercise library were applied via Supabase migrations.

`exercises` and `workout_logs` both allow `user_id IS NULL` to mean "shared demo
content, readable by all, writable by none". `plan_days` and `plan_exercises` stay
strictly per-user — a shared plan that any visitor could delete would be worse than
no plan.

Anonymous users accumulate with no automatic cleanup, and Supabase rate-limits
anonymous sign-ins to 30/hour per IP. To reap empty sessions without touching
anyone's data:

```sql
delete from auth.users u
where u.is_anonymous
  and not exists (select 1 from workout_logs   w where w.user_id = u.id)
  and not exists (select 1 from plan_days      d where d.user_id = u.id)
  and not exists (select 1 from plan_exercises e where e.user_id = u.id);
```
