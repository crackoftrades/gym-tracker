import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Opens a MyFatoorah invoice for one course and hands the app back a URL to
// send the buyer to.
//
// The price is read from the `courses` table here, never taken from the
// request — the client only says *which* course it wants, so a tampered body
// cannot buy a 27 KWD block for 1 fils. The booking row is written first, in
// `pending`, so an invoice can never exist without something to reconcile it
// against; it moves to `awaiting_payment` once MyFatoorah returns the link, and
// only `payment-webhook` is allowed to take it any further.

// Demo/test gateway. Swap to the live host for the account's country when the
// project leaves the demo phase — see https://docs.myfatoorah.com/docs/api-key
const MF_BASE = (Deno.env.get('MYFATOORAH_BASE_URL') ?? 'https://apitest.myfatoorah.com').replace(/\/+$/, '');

// MyFatoorah publishes this token for its sandbox, so the demo works with no
// setup. Set MYFATOORAH_API_KEY on the project to use your own test account.
const MF_DEMO_KEY =
  'SK_KWT_vVZlnnAqu8jRByOWaRPNId4ShzEDNt256dvnjebuyzo52dXjAfRx2ixW5umjWSUx';
const MF_KEY = Deno.env.get('MYFATOORAH_API_KEY')?.trim() || MF_DEMO_KEY;

// True only for MyFatoorah's sandbox host. Gates the fallback below — on a live
// host a rejected key must fail loudly, never quietly bill through some other
// account.
const IS_SANDBOX = MF_BASE.includes('apitest.myfatoorah.com');

const isAuthFailure = (payload: { IsSuccess?: boolean; Message?: string } | null) =>
  payload?.IsSuccess === false && /token is not valid|expired/i.test(payload?.Message ?? '');

// Posts to MyFatoorah, and if the configured key is refused on the sandbox,
// retries once with the built-in public test token.
//
// A `registertest` account has to be activated by MyFatoorah support before its
// keys authenticate, and until that happens every key it issues is rejected —
// which would otherwise take the whole demo down. This keeps the sandbox
// working through that wait, and starts using the real key the moment it
// becomes valid, with no redeploy and nothing to remember to switch back.
async function mfPost(path: string, body: unknown) {
  const call = (key: string) =>
    fetch(`${MF_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

  const res = await call(MF_KEY);
  const payload = await res.json().catch(() => null);
  if (!isAuthFailure(payload) || MF_KEY === MF_DEMO_KEY || !IS_SANDBOX) {
    return { payload, status: res.status, usedSandboxFallback: false };
  }

  console.warn('MYFATOORAH_API_KEY was rejected by the sandbox — retrying on the public test token.');
  const retry = await call(MF_DEMO_KEY);
  return {
    payload: await retry.json().catch(() => null),
    status: retry.status,
    usedSandboxFallback: true,
  };
}

// The buyer comes back to one of our own pages after paying. The client sends
// its origin so previews and localhost work, but an origin we don't recognise
// is dropped rather than trusted — otherwise the invoice becomes an open
// redirect signed with our merchant account.
const FALLBACK_ORIGIN = Deno.env.get('PUBLIC_SITE_URL') ?? 'https://gym-tracker-pearl-seven.vercel.app';
const ALLOWED_ORIGINS = new Set(
  (
    Deno.env.get('PAYMENT_ALLOWED_ORIGINS') ??
    [
      FALLBACK_ORIGIN,
      'https://gym-tracker-pearl-seven.vercel.app',
      'https://gym-tracker-chaka1.vercel.app',
      'https://gym-tracker-git-main-chaka1.vercel.app',
      'http://localhost:8081',
      'http://localhost:19006',
    ].join(',')
  )
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean),
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function safeOrigin(raw: unknown) {
  const candidate = String(raw ?? '').trim().replace(/\/+$/, '');
  return ALLOWED_ORIGINS.has(candidate) ? candidate : FALLBACK_ORIGIN.replace(/\/+$/, '');
}

// "GT-MFA3K1P2-7QX4". Short enough for CustomerReference, unique enough that
// two people checking out in the same millisecond still get separate rows.
function newReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const noise = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => b.toString(36).toUpperCase().padStart(2, '0'))
    .join('')
    .slice(0, 4);
  return `GT-${stamp}-${noise}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'This project is missing its Supabase service credentials.' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Who is buying. verify_jwt already rejected anyone without a token; this
  // turns the token into the user the booking is written against.
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (userError || !user) return json({ error: 'Sign in before buying a course.' }, 401);

  let payload: { courseId?: string; courseSlug?: string; origin?: string; language?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const courseId = String(payload.courseId ?? '').trim();
  const courseSlug = String(payload.courseSlug ?? '').trim();
  if (!courseId && !courseSlug) return json({ error: 'Missing "courseId".' }, 400);

  const lookup = admin.from('courses').select('*').eq('is_active', true).limit(1);
  const { data: course, error: courseError } = await (courseId
    ? lookup.eq('id', courseId)
    : lookup.eq('slug', courseSlug)
  ).maybeSingle();

  if (courseError) return json({ error: `Could not load that course: ${courseError.message}` }, 500);
  if (!course) return json({ error: 'That course is no longer available.' }, 404);

  // Nobody should pay twice for the same block.
  const { data: owned } = await admin
    .from('bookings')
    .select('id, reference')
    .eq('user_id', user.id)
    .eq('course_id', course.id)
    .eq('payment_status', 'paid')
    .maybeSingle();
  if (owned) {
    return json({ error: 'You already own this course.', alreadyOwned: true, reference: owned.reference }, 409);
  }

  const origin = safeOrigin(payload.origin);
  const reference = newReference();
  const amount = Number(course.price);
  const currency = String(course.currency || 'KWD');

  // Written before the gateway is called: an invoice with no booking behind it
  // is unreconcilable, a booking with no invoice is just an abandoned cart.
  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .insert({
      user_id: user.id,
      course_id: course.id,
      reference,
      payment_status: 'pending',
      amount,
      currency,
      gateway: 'myfatoorah',
    })
    .select()
    .single();
  if (bookingError) return json({ error: `Could not start the booking: ${bookingError.message}` }, 500);

  const buyerName =
    String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '').trim() ||
    String(user.email ?? '').split('@')[0] ||
    'Gym Tracker member';

  const invoiceRequest: Record<string, unknown> = {
    // LNK = return the payment link, don't email or SMS the buyer.
    NotificationOption: 'LNK',
    CustomerName: buyerName.slice(0, 100),
    InvoiceValue: amount,
    DisplayCurrencyIso: currency,
    Language: payload.language === 'ar' ? 'ar' : 'en',
    // Both come back untouched on the webhook — this is how the payment finds
    // its booking again.
    CustomerReference: reference,
    UserDefinedField: reference,
    CallBackUrl: `${origin}/pay/success/${reference}`,
    ErrorUrl: `${origin}/pay/error/${reference}`,
    InvoiceItems: [{ ItemName: String(course.title).slice(0, 100), Quantity: 1, UnitPrice: amount }],
  };
  if (user.email) invoiceRequest.CustomerEmail = user.email;

  let mfResponse: {
    IsSuccess?: boolean;
    Message?: string;
    ValidationErrors?: { Name?: string; Error?: string }[] | null;
    Data?: { InvoiceId?: number | string; InvoiceURL?: string };
  } | null = null;
  let transportError = '';

  try {
    const { payload, status } = await mfPost('/v2/SendPayment', invoiceRequest);
    mfResponse = payload;
    if (!mfResponse) transportError = `MyFatoorah returned a non-JSON response (HTTP ${status}).`;
  } catch (e) {
    transportError = `Could not reach MyFatoorah: ${String(e)}`;
  }

  const paymentUrl = String(mfResponse?.Data?.InvoiceURL ?? '');
  const invoiceId = mfResponse?.Data?.InvoiceId != null ? String(mfResponse.Data.InvoiceId) : null;

  if (!mfResponse?.IsSuccess || !paymentUrl) {
    const detail =
      transportError ||
      mfResponse?.ValidationErrors?.map((v) => `${v.Name}: ${v.Error}`).join('; ') ||
      mfResponse?.Message ||
      'MyFatoorah refused the invoice.';
    await admin
      .from('bookings')
      .update({ payment_status: 'failed', failure_reason: detail.slice(0, 500) })
      .eq('id', booking.id);
    console.error('SendPayment failed', { reference, detail, base: MF_BASE });
    return json({ error: detail, reference }, 502);
  }

  const { error: updateError } = await admin
    .from('bookings')
    .update({ payment_status: 'awaiting_payment', invoice_id: invoiceId, payment_url: paymentUrl })
    .eq('id', booking.id);
  if (updateError) console.error('Could not attach the invoice to the booking', updateError.message);

  return json({
    paymentUrl,
    reference,
    invoiceId,
    bookingId: booking.id,
    amount,
    currency,
    course: { id: course.id, slug: course.slug, title: course.title },
  });
});
