# Gym Tracker

Log workouts (sets · reps · weight), plan your weekly split, and watch your progress over time. Built with Expo (React Native + web) and Supabase.

## Features

- **Today** — your training-day exercises with one-tap logging, plus a weekly summary (sessions, volume, exercises).
- **Weekly Plan** — build training days (Push / Pull / Legs / Upper / Lower / Full Body) and stack exercises with target sets × reps. Saved to your account.
- **Exercises** — a curated library with step-by-step technique, coaching cues, and **common mistakes → how to fix them**. Filter by muscle group, split day, and equipment.
- **Progress** — filter your history by **exercise type, date range, and split day**. See per-exercise progress status (progressing / plateaued / new), auto-detected personal records, a mini progress chart, and a full timeline.

## Data & privacy

- Storage is **Supabase (cloud)** — your plans and logs sync across devices and are backed up.
- Every table has **Row Level Security** tied to your user id: you can only read/write your own plans and logs. The exercise library is shared read-only.

## Run it

```bash
npm install
npm run web      # or: npm run ios / npm run android
```

Config lives in `.env` (copy from `.env.example`). The Supabase URL and publishable key are safe to expose — they only work through Row Level Security.

## Project layout

- `App.js` — session gating + bottom-tab navigation + detail/log overlays
- `src/lib/supabase.js` — Supabase client (AsyncStorage-backed session)
- `src/lib/db.js` — all data access (exercises, plan, logs)
- `src/lib/metrics.js` — volume, estimated 1RM, PR detection, progress status
- `src/screens/` — Auth, Today, Plan, Library, ExerciseDetail, Progress
- `src/components/` — Button, Chip, Tag, ExerciseRow, ExercisePicker, LogSheet

## Database

Tables (all with RLS): `exercises`, `plan_days`, `plan_exercises`, `workout_logs` (sets stored as JSONB). Schema and the seeded exercise library were applied via Supabase migrations.
