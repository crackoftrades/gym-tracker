import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Reports one booking's payment status. It cannot change it.
//
// This used to settle payments by polling MyFatoorah, because the project ran
// on the shared public sandbox token and no webhook could ever be registered
// against it. That is no longer true: `payment-webhook` receives MyFatoorah's
// signed events and is now the single writer of `payment_status`.
//
// The write path is deliberately gone rather than the whole function, so a
// browser still running an older bundle degrades to a harmless read instead of
// erroring. Keeping it read-only also means there is exactly one way a booking
// can be marked paid — a signed event from the gateway — with no second route
// to audit or secure.
//
// The app no longer calls this. It is kept as a support tool: given a
// reference, it says what the database holds and what MyFatoorah says, so a
// disagreement between the two is visible without database access.

const MF_BASE = (Deno.env.get('MYFATOORAH_BASE_URL') ?? 'https://apitest.myfatoorah.com').replace(/\/+$/, '');
const MF_DEMO_KEY =
  'SK_KWT_vVZlnnAqu8jRByOWaRPNId4ShzEDNt256dvnjebuyzo52dXjAfRx2ixW5umjWSUx';
const MF_KEY = Deno.env.get('MYFATOORAH_API_KEY')?.trim() || MF_DEMO_KEY;
const IS_SANDBOX = MF_BASE.includes('apitest.myfatoorah.com');

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

const str = (v: unknown) => (v == null ? '' : String(v));

const isAuthFailure = (payload: { IsSuccess?: boolean; Message?: string } | null) =>
  payload?.IsSuccess === false && /token is not valid|expired/i.test(payload?.Message ?? '');

async function fetchPaymentStatus(key: string, keyType: 'InvoiceId' | 'CustomerReference') {
  const call = (apiKey: string) =>
    fetch(`${MF_BASE}/v2/getPaymentStatus`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ Key: key, KeyType: keyType }),
    });

  let payload = await (await call(MF_KEY)).json().catch(() => null);
  if (isAuthFailure(payload) && MF_KEY !== MF_DEMO_KEY && IS_SANDBOX) {
    console.warn('MYFATOORAH_API_KEY was rejected by the sandbox — retrying on the public test token.');
    payload = await (await call(MF_DEMO_KEY)).json().catch(() => null);
  }
  return payload?.IsSuccess ? (payload.Data as Record<string, any>) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Missing Supabase service credentials.' }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (userError || !user) return json({ error: 'Sign in first.' }, 401);

  let payload: { reference?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const reference = String(payload.reference ?? '').trim();
  if (!reference) return json({ error: 'Missing "reference".' }, 400);

  // Scoped to the caller: you can only ask about your own booking.
  const { data: booking, error: lookupError } = await admin
    .from('bookings')
    .select('reference, payment_status, invoice_id, paid_at')
    .eq('reference', reference)
    .eq('user_id', user.id)
    .maybeSingle();

  if (lookupError) return json({ error: `Lookup failed: ${lookupError.message}` }, 500);
  if (!booking) return json({ error: 'No such booking on your account.' }, 404);

  // What MyFatoorah says, purely for comparison. Nothing is written either way.
  let gateway: { invoiceStatus: string; transactionStatus: string } | null = null;
  try {
    const confirmed =
      (booking.invoice_id && (await fetchPaymentStatus(booking.invoice_id, 'InvoiceId'))) ||
      (await fetchPaymentStatus(booking.reference, 'CustomerReference'));
    if (confirmed) {
      const txs = Array.isArray(confirmed.InvoiceTransactions) ? confirmed.InvoiceTransactions : [];
      const latest = (txs[txs.length - 1] ?? {}) as Record<string, any>;
      gateway = {
        invoiceStatus: str(confirmed.InvoiceStatus),
        transactionStatus: str(latest.TransactionStatus),
      };
    }
  } catch (e) {
    console.error('Could not reach MyFatoorah', String(e));
  }

  return json({
    reference: booking.reference,
    paymentStatus: booking.payment_status,
    paidAt: booking.paid_at,
    gateway,
    readOnly: true,
    note: 'payment_status is written only by the payment-webhook function.',
  });
});
