# Gym Tracker

Log workouts (sets · reps · weight), plan your weekly split, and watch your progress over time. Built with Expo (React Native + web) and Supabase.

## Features

- **Today** — your training-day exercises with one-tap logging, plus a weekly summary (sessions, volume, exercises).
- **Weekly Plan** — build training days (Push / Pull / Legs / Upper / Lower / Full Body) and stack exercises with target sets × reps.
- **Exercises** — a curated library with step-by-step technique, coaching cues, and **common mistakes → how to fix them**. Filter by muscle group, split day, and equipment.
- **Progress** — filter your history by **exercise type, date range, and split day**. See per-exercise progress status (progressing / plateaued / new), auto-detected personal records, a mini progress chart, and a full timeline.
- **Courses** — pre-planned training blocks you can buy. One tap opens a MyFatoorah invoice, and the gateway's webhook is the only thing that can mark a booking paid.
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

## Courses & payments (MyFatoorah)

The **Courses** tab sells pre-planned training blocks. The whole flow is four moving
parts, and the app is trusted with none of the money-shaped decisions:

```
Courses tab  →  create-payment (edge fn)  →  MyFatoorah invoice  →  buyer pays
                        │                                              │
                   bookings row                              payment-webhook (edge fn)
                 payment_status='awaiting_payment'          payment_status='paid'/'failed'
                                                                       │
                                     /pay/success/<ref>  ←  buyer redirected back
```

**Demo phase.** Everything points at MyFatoorah's sandbox, `https://apitest.myfatoorah.com`.
No real money moves. Prices are in **KWD**, a three-decimal currency — `12.500` is twelve
and a half dinars.

### The pieces

- `src/screens/CoursesScreen.js` — the catalogue and the Pay button.
- `src/lib/payments.js` — course/booking reads, `startCoursePayment()`, and the
  `/pay/...` route parsing.
- `supabase/functions/create-payment/` — reads the price from the `courses` table,
  writes a `bookings` row, calls MyFatoorah `POST /v2/SendPayment`, returns `InvoiceURL`.
- `supabase/functions/payment-webhook/` — receives MyFatoorah's event and sets
  `payment_status`.
- `supabase/functions/confirm-payment/` — the same job, pulled rather than pushed, for
  when no webhook can be registered. Together these two are **the only things in the
  system that can write `payment_status`.**
- `src/screens/PaymentResultScreen.js` — the success and error pages.

### Why the client can't cheat

Three separate things would each have to fail before someone could enrol for free:

1. **The price is never sent by the client.** `create-payment` takes a `courseId` and
   looks the amount up server-side.
2. **`payment_status` is service-role-only.** `anon` and `authenticated` hold `SELECT`
   and nothing else on `bookings`, there is no `UPDATE` policy, and a `BEFORE UPDATE`
   trigger raises `insufficient_privilege` if any role other than the service role
   changes the column — so a future migration that accidentally grants `UPDATE` still
   can't open the door.
3. **The webhook doesn't believe its own request body.** It verifies the
   `MyFatoorah-Signature` HMAC, then re-reads the status from
   `POST /v2/getPaymentStatus` and decides from *that*. A forged "Paid" event for a real
   unpaid invoice leaves the booking at `awaiting_payment`.

That third check matters more than it looks: an earlier version of the webhook let the
body's `Transaction.Status` fill in when the API response had no transactions yet, and a
forged event marked a booking paid. Confirmed data and body data are now never mixed —
whichever source is in use supplies *every* field.

### `bookings.payment_status`

| Value | Set by | Meaning |
| --- | --- | --- |
| `pending` | `create-payment` | Row written, invoice not opened yet |
| `awaiting_payment` | `create-payment` | Invoice is live, buyer sent to checkout |
| `paid` | `payment-webhook` | MyFatoorah's API confirmed the payment. Terminal — never walked back |
| `failed` | either | Invoice refused, or the payment failed / was cancelled |
| `expired` | `payment-webhook` | The invoice timed out unpaid |

### Two ways a payment gets confirmed

The gateway can **push** the result to us, or we can **pull** it. Both end up asking
MyFatoorah's own API and writing what it says, so neither is weaker than the other:

| | `payment-webhook` (push) | `confirm-payment` (pull) |
| --- | --- | --- |
| Triggered by | MyFatoorah POSTing an event | The app, while the buyer waits |
| Needs portal setup | Yes — webhook registered on **your** merchant account | No |
| Verifies | Signature, then re-reads `getPaymentStatus` | Reads `getPaymentStatus` |
| Scope | Any booking | Only a booking belonging to the caller |

**The sandbox runs on the pull path alone.** Webhooks are registered per merchant
account, and the default key is MyFatoorah's *public* sandbox token — you don't own its
portal, so no event will ever reach you. `confirm-payment` closes that loop with zero
setup: the success page calls it while polling, and the Courses tab calls it on load for
any booking still sitting at `awaiting_payment`, so a buyer who closed the tab
mid-checkout still comes back to **ENROLLED**.

Once you register a real webhook, the pull path stays useful as the backstop for a
delayed or dropped event. Nothing needs changing to switch over.

### Registering the webhook — a portal step, not an API call

Only needed on your own merchant account; skip it for sandbox demos.

**MyFatoorah registers webhooks once in the dashboard.** There is no per-charge webhook
parameter (`SendPayment` has `CallBackUrl`/`ErrorUrl`, which are *browser redirects*, not
server-to-server calls) and no API that can set the URL — `/v2/GetWebhooks` only reads
delivery logs. So this step has to be done by hand:

1. Log into the MyFatoorah portal → **Integration Settings → Webhook Settings**
2. Enable the webhook feature
3. Endpoint URL:
   `https://yijxsityqkuchmjzpggi.supabase.co/functions/v1/payment-webhook`
4. Event types: **Payment status changed** (event 1)
5. Webhook version: **V2** (V1 payloads are handled too), and configure retries
6. Enable the **secret key** option and copy the key
7. Save

Then set the key on Supabase (Project Settings → Edge Functions → Secrets):

| Secret | Needed? | Notes |
| --- | --- | --- |
| *(none)* | — | The sandbox works with no secrets set at all |
| `MYFATOORAH_WEBHOOK_SECRET` | **Yes, before launch** | Without it the webhook logs a warning and leans entirely on the API read-back |
| `MYFATOORAH_API_KEY` | On go-live | Falls back to MyFatoorah's published sandbox token |
| `MYFATOORAH_BASE_URL` | On go-live | Defaults to `https://apitest.myfatoorah.com`; use the live host for your country |
| `PUBLIC_SITE_URL` / `PAYMENT_ALLOWED_ORIGINS` | Optional | Return-URL allow-list. Unrecognised origins are dropped, so the invoice can't be turned into an open redirect |

### The sandbox never breaks on a bad key

A `registertest` account has to be activated by MyFatoorah support before its API
keys authenticate. Until that happens every key it issues comes back
`"The token is not valid or expired!"` — which would otherwise take the entire demo
down while you wait on an email.

So on the **sandbox host only**, all three functions retry once with the built-in
public test token when the configured key is refused, and log a warning. The demo
keeps working, and the real key starts being used the moment it becomes valid —
no redeploy, nothing to remember to switch back.

This is gated on `MF_BASE` pointing at `apitest.myfatoorah.com`. On a live host a
refused key fails loudly, as it must: quietly billing through a different merchant
account would be far worse than an outage.

Deploy after edits:

```bash
npx supabase functions deploy create-payment confirm-payment payment-webhook --project-ref yijxsityqkuchmjzpggi
```

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
- `src/lib/payments.js` — courses, bookings, checkout, and `/pay/...` route parsing
- `supabase/functions/workout-summary/` — the edge function (Deno + OpenRouter)
- `supabase/functions/create-payment/` — opens a MyFatoorah invoice for one course
- `supabase/functions/confirm-payment/` — pulls one booking's status from the gateway
- `supabase/functions/payment-webhook/` — the gateway's push, for a real merchant account
- `supabase/migrations/` — schema as applied (courses, bookings, RLS)
- `src/lib/metrics.js` — volume, estimated 1RM, PR detection, progress status
- `src/screens/` — Today, Plan, Library, Courses, ExerciseDetail, Progress, PaymentResult
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
