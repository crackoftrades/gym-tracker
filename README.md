# Gym Tracker

Log workouts (sets · reps · weight), plan your weekly split, and watch your progress over time. Built with Expo (React Native + web) and Supabase.

## Features

- **Today** — your training-day exercises with one-tap logging, plus a weekly summary (sessions, volume, exercises).
- **Weekly Plan** — build training days (Push / Pull / Legs / Upper / Lower / Full Body) and stack exercises with target sets × reps.
- **Exercises** — a curated library with step-by-step technique, coaching cues, and **common mistakes → how to fix them**. Filter by muscle group, split day, and equipment.
- **Progress** — filter your history by **exercise type, date range, and split day**. See per-exercise progress status (progressing / plateaued / new), auto-detected personal records, a mini progress chart, and a full timeline.

## Demo stage — no login

There is no sign-up or sign-in screen. On first launch the app silently creates a
**Supabase anonymous session** and stores it on the device, so you land straight on
Today. Nothing to remember, nothing to type.

What this means in practice:

- Your plan and logs are **private to that device** — the anonymous user id is the
  owner, and Row Level Security is unchanged, so nobody else can read your rows.
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
- `src/lib/metrics.js` — volume, estimated 1RM, PR detection, progress status
- `src/screens/` — Today, Plan, Library, ExerciseDetail, Progress
- `src/components/` — Button, Chip, Tag, ExerciseRow, ExercisePicker, LogSheet

## Database

Tables (all with RLS): `exercises`, `plan_days`, `plan_exercises`, `workout_logs` (sets stored as JSONB). Schema and the seeded exercise library were applied via Supabase migrations.
