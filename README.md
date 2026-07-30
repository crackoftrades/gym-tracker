# Gym Tracker

Log workouts (sets · reps · weight), plan your weekly split, and watch your progress over time. Built with Expo (React Native + web) and Supabase.

## Features

- **Today** — your training-day exercises with one-tap logging, plus a weekly summary (sessions, volume, exercises).
- **Weekly Plan** — build training days (Push / Pull / Legs / Upper / Lower / Full Body) and stack exercises with target sets × reps.
- **Exercises** — a curated library with step-by-step technique, coaching cues, and **common mistakes → how to fix them**. Filter by muscle group, split day, and equipment.
- **Progress** — filter your history by **exercise type, date range, and split day**. See per-exercise progress status (progressing / plateaued / new), auto-detected personal records, a mini progress chart, and a full timeline.
- **SARGE** — every workout you save is sent to a Supabase edge function where an AI drill instructor reads your numbers and tells you what they're worth. Shown under the entry in Recent activity and the Progress timeline.

## SARGE, the AI training partner (edge function)

`supabase/functions/workout-summary` takes `{ exercise, sets: [{reps, weight}], notes, splitDay }`,
asks OpenRouter for 1–2 grounded sentences about the session, and returns
`{ summary, model, coach }`. It needs an `OPENROUTER_API_KEY` secret on the Supabase project.

**The character.** SARGE is a relentless, no-excuses drill instructor in the ultra-endurance
hardass mold: comfort is the enemy, the logged set is evidence rather than an achievement,
and respect is earned. The full personality lives in `SYSTEM_PROMPT` at the top of the
function — edit it there and redeploy to change the voice. He is an original character, not
an impersonation of any real athlete, so the app never attributes invented words to a real
person. The prompt also fences him in: hard on the standard but never cruel to the person,
no profanity, no "push through the pain", no medical or nutrition advice, and no inventing
numbers that weren't in the session.

`COACH_NAME` in `src/lib/constants.js` drives the name shown in the UI — keep it in sync with
the function's own `COACH_NAME`.

Saving a workout triggers it automatically — no button, no setup step. `App.js` hands
the freshly inserted row to `summarizeWorkout()` (`src/lib/coach.js`), which invokes the
function and writes the reply to `workout_logs.ai_summary`, so the blurb stays under the
entry on later visits instead of being regenerated on every load. While it's in flight the
entry shows "SARGE is sizing up your session…"; if it fails the workout is still saved.

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

## Accounts

Launching with no stored session lands you on `src/screens/AuthScreen.js`, which offers
three ways in:

- **Sign up** with email + password. Supabase creates the account and emails a
  confirmation link; the screen switches to a "confirm your email" panel until it's clicked.
- **Sign in** with the same credentials once confirmed.
- **Continue as guest** — the original demo behaviour, an anonymous Supabase session
  that keeps everything on this device.

Log out from the account chip in the top-right corner (it shows your email, or "Guest").
`src/lib/auth.js` holds every auth call plus `authErrorMessage()`, which turns Supabase's
terse errors into something a user can act on.

**Email confirmation is on** (`mailer_autoconfirm: false` on this project), so `signUp()`
returns no session and the account can't sign in until the link is clicked. To let people
in immediately instead, turn off **Confirm email** under Authentication → Sign In /
Providers → Email; the app already handles both — it reads whether a session came back
rather than assuming.

Two dashboard settings matter for the confirmation link to work:

- **Site URL / Redirect URLs** (Authentication → URL Configuration) must include the
  deployed origin, otherwise the link bounces to `localhost:3000`. The app passes
  `emailRedirectTo: window.location.origin` on web.
- Supabase's **built-in email service is rate-limited** (a couple of messages an hour).
  Wire up custom SMTP before letting real users sign up.

Data ownership: every row is keyed to `auth.uid()` and Row Level Security enforces it, so
a guest's logs and an account's logs never mix. `workout_logs` reads are **owner-only** —
a new account lands on an empty app until it logs something. The three shared sample
workouts that used to greet every visitor were removed along with the carve-out that
surfaced them; their contents are kept in `supabase/seed-rows-removed-2026-07-30.sql`.

Guest mode still requires **Anonymous sign-ins** enabled under Authentication → Sign In /
Providers. Guest data belongs to a throwaway anonymous user; signing out of guest mode
abandons it. Converting a guest into a real account in place (keeping their history) would
mean calling `supabase.auth.updateUser({ email, password })` on the anonymous session —
not wired up yet.

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

- `App.js` — auth gate + bottom-tab navigation + detail/log/account overlays
- `src/lib/supabase.js` — the Supabase client
- `src/lib/auth.js` — sign up / sign in / guest / sign out + error copy
- `src/screens/AuthScreen.js` — sign-in and sign-up form
- `src/components/AccountSheet.js` — who you're signed in as, and log out
- `src/lib/db.js` — all data access (exercises, plan, logs)
- `src/lib/coach.js` — calls the `workout-summary` edge function and saves its reply
- `supabase/functions/workout-summary/` — the edge function (Deno + OpenRouter)
- `src/lib/metrics.js` — volume, estimated 1RM, PR detection, progress status
- `src/screens/` — Today, Plan, Library, ExerciseDetail, Progress
- `src/components/` — Button, Chip, Tag, ExerciseRow, ExercisePicker, LogSheet

## Database

Tables (all with RLS): `exercises`, `plan_days`, `plan_exercises`, `workout_logs` (sets stored as JSONB, coach blurb in `ai_summary`). Schema and the seeded exercise library were applied via Supabase migrations.

`workout_logs` policies (all `to authenticated`):

| Command | Expression |
| --- | --- |
| SELECT | `USING (user_id = auth.uid())` |
| INSERT | `WITH CHECK (user_id = auth.uid())` |
| UPDATE | `USING / WITH CHECK (user_id = auth.uid())` — needed so SARGE can write `ai_summary` back |
| DELETE | `USING (user_id = auth.uid())` |

`user_id` is `uuid NOT NULL` referencing `auth.users(id)` **on delete cascade** — deleting
an account takes its logs with it. Ownership is therefore structural, not just enforced by
policy: a row cannot exist without an owner even on paths that bypass RLS.

There is no `DEFAULT auth.uid()`; `logWorkout()` sets `user_id` explicitly, and an insert
that forgets it should fail loudly rather than quietly attach to whoever is calling.

`exercises` still allows `user_id IS NULL` to mean "shared library content, readable by
all, writable by none". `plan_days` and `plan_exercises` stay strictly per-user — a shared
plan that any visitor could delete would be worse than no plan.

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
