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
    {
      role: 'system',
      content:
        'You are a gym training partner writing a one-liner right after a set is logged. ' +
        'Reply with 1-2 short sentences (max 30 words) of specific, grounded encouragement. ' +
        'Reference a real number from the session (reps, weight, or total volume). ' +
        'No emoji, no markdown, no headings, no medical or nutrition advice. Never invent numbers.',
    },
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

  return json({ summary: out.summary, model: out.model });
});
