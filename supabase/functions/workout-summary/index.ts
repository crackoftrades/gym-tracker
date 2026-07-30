import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// Turns one logged workout into a short motivational blurb via OpenRouter.
// Called automatically by the app right after a workout is saved.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Free-tier only — no paid model is attempted, so this never needs OpenRouter
// credits. Pinned to specific models rather than `openrouter/free`, whose
// random routing lands on classifiers and reasoning models that return no
// prose. First is primary; the rest are only tried if it errors or is empty.
const MODELS = (
  Deno.env.get('OPENROUTER_MODELS') ?? 'google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

const COACH_NAME = 'SARGE';

// The character. An original drill-instructor persona in the ultra-endurance
// hardass mold — deliberately not an impersonation of any real athlete, so the
// app never puts invented words in a real person's mouth.
const SYSTEM_PROMPT = `You are ${COACH_NAME}, the user's AI training partner. You are a relentless, no-excuses drill instructor cut from ultra-endurance, ex-military cloth. You have suffered, and you expect them to. Comfort is the enemy. Motivation is garbage — it fades. Discipline is all that counts.

The set they just logged is not an achievement. It is evidence. Either it proves they are callousing their mind, or it proves they took the easy road today. Read the numbers and tell them which one it is.

VOICE
- Second person. Direct. Confrontational. Short, punchy fragments. No preamble, no send-off.
- Speak in imperatives. Land on one hard truth or one demand.
- Cite one real number from the session — reps, weight, or total volume. Never invent numbers.
- Respect is earned, never assumed. When the numbers are genuinely heavy, give it half a sentence, then point at the next mountain.
- Never soothe. No "great job", no "keep it up", no participation-trophy language, no emoji, no markdown, no hashtags.

HARD RULES
- 1-2 sentences. 30 words maximum. Longer means softer.
- Attack the comfort zone, never the person. No remarks about their body, weight, worth, or intelligence. Hard on the standard, never cruel to the human.
- No profanity.
- Never tell them to push through pain or injury. No medical, injury, or nutrition advice.
- Never claim to be a real person or a real athlete.`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Set = { reps?: number | string; weight?: number | string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// "10×60kg, 8×65kg, 6×70kg · 1,610 kg volume · top set 70 kg"
function describe(sets: Set[]) {
  const clean = sets.map((s) => ({ reps: num(s?.reps), weight: num(s?.weight) })).filter((s) => s.reps > 0);
  const volume = clean.reduce((t, s) => t + s.reps * s.weight, 0);
  const top = clean.reduce((t, s) => Math.max(t, s.weight), 0);
  return {
    clean,
    volume,
    top,
    line: clean.map((s) => `${s.reps}×${s.weight}kg`).join(', '),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    return json({ error: 'OPENROUTER_API_KEY is not set on this project.' }, 500);
  }

  let payload: {
    exercise?: string;
    exerciseName?: string;
    sets?: Set[];
    notes?: string;
    performedOn?: string;
    splitDay?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const exercise = String(payload.exercise ?? payload.exerciseName ?? '').trim();
  const sets = Array.isArray(payload.sets) ? payload.sets : [];
  if (!exercise) return json({ error: 'Missing "exercise".' }, 400);

  const { clean, volume, top, line } = describe(sets);
  if (clean.length === 0) return json({ error: 'Need at least one set with reps.' }, 400);

  const notes = String(payload.notes ?? '').trim().slice(0, 300);
  const facts = [
    `Exercise: ${exercise}`,
    payload.splitDay ? `Split day: ${payload.splitDay}` : null,
    `Sets: ${clean.length} (${line})`,
    `Total volume: ${Math.round(volume).toLocaleString('en-US')} kg`,
    `Heaviest set: ${top} kg`,
    notes ? `Athlete's note: ${notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Here is the session I just logged:\n${facts}` },
  ];

  async function ask(model: string) {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://gym-tracker.vercel.app',
        'X-Title': 'Gym Tracker',
      },
      body: JSON.stringify({ model, max_tokens: 160, temperature: 0.8, messages }),
    });
    const data = await res.json().catch(() => null);
    const summary = String(data?.choices?.[0]?.message?.content ?? '').trim();
    return {
      ok: res.ok && !!summary,
      status: res.status,
      summary,
      model: data?.model ?? model,
      detail: data?.error?.message ?? (res.ok ? 'empty response' : `HTTP ${res.status}`),
    };
  }

  let out;
  try {
    for (const model of MODELS) {
      out = await ask(model);
      if (out.ok) break;
    }
  } catch (e) {
    return json({ error: `Could not reach OpenRouter: ${String(e)}` }, 502);
  }

  if (!out.ok) return json({ error: `OpenRouter request failed: ${out.detail}` }, 502);

  return json({ summary: out.summary, model: out.model, coach: COACH_NAME });
});
