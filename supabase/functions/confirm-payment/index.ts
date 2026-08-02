import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Asks MyFatoorah what happened to one booking, and writes the answer.
//
// `payment-webhook` is the same job driven by a push; this is the pull. It
// exists because MyFatoorah registers webhooks per merchant account in the
// portal, so a project running on the shared public sandbox token — which
// belongs to MyFatoorah, not to us — can never receive one. Polling
// `getPaymentStatus` closes that loop with no portal setup at all.
//
// It is no weaker than the webhook, because the webhook doesn't trust its
// request body either: both routes end up asking MyFatoorah's own API and
// writing what it says. The caller only names one of their own bookings; they
// have no say in the outcome.
//
// Once a real webhook is registered this stays useful — it's what the success
// page falls back on if an event is delayed or dropped.

const MF_BASE = (Deno.env.get('MYFATOORAH_BASE_URL') ?? 'https://apitest.myfatoorah.com').replace(/\/+$/, '');
const MF_DEMO_KEY =
  'SK_KWT_vVZlnnAqu8jRByOWaRPNId4ShzEDNt256dvnjebuyzo52dXjAfRx2ixW5umjWSUx';
const MF_KEY = Deno.env.get('MYFATOORAH_API_KEY') ?? MF_DEMO_KEY;

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

async function fetchPaymentStatus(key: string, keyType: 'InvoiceId' | 'CustomerReference') {
  const res = await fetch(`${MF_BASE}/v2/getPaymentStatus`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MF_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ Key: key, KeyType: keyType }),
  });
  const payload = await res.json().catch(() => null);
  return payload?.IsSuccess ? (payload.Data as Record<string, any>) : null;
}

// MyFatoorah spells the success transaction status "Succss" in places, so match
// on a prefix rather than an exact string. Kept in step with `payment-webhook`.
function classify(invoiceStatus: string, transactionStatus: string) {
  if (/^succ/i.test(transactionStatus) || /^paid$/i.test(invoiceStatus)) return 'paid';
  if (/expir/i.test(invoiceStatus) || /expir/i.test(transactionStatus)) return 'expired';
  if (/fail|cancel|declin|reject/i.test(invoiceStatus) || /fail|cancel|declin|reject/i.test(transactionStatus)) {
    return 'failed';
  }
  return 'awaiting_payment';
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
    .select('id, reference, payment_status, invoice_id')
    .eq('reference', reference)
    .eq('user_id', user.id)
    .maybeSingle();

  if (lookupError) return json({ error: `Lookup failed: ${lookupError.message}` }, 500);
  if (!booking) return json({ error: 'No such booking on your account.' }, 404);

  // Already settled — nothing to ask, and `paid` is never walked back.
  if (['paid', 'failed', 'expired'].includes(booking.payment_status)) {
    return json({ reference: booking.reference, paymentStatus: booking.payment_status, checked: false });
  }

  let confirmed: Record<string, any> | null = null;
  try {
    if (booking.invoice_id) confirmed = await fetchPaymentStatus(booking.invoice_id, 'InvoiceId');
    if (!confirmed) confirmed = await fetchPaymentStatus(booking.reference, 'CustomerReference');
  } catch (e) {
    console.error('Could not reach MyFatoorah', String(e));
  }

  if (!confirmed) {
    return json({ reference: booking.reference, paymentStatus: booking.payment_status, checked: false });
  }

  const txs = Array.isArray(confirmed.InvoiceTransactions) ? confirmed.InvoiceTransactions : [];
  const latest = (txs[txs.length - 1] ?? {}) as Record<string, any>;
  const status = classify(str(confirmed.InvoiceStatus), str(latest.TransactionStatus));

  if (status === booking.payment_status) {
    return json({ reference: booking.reference, paymentStatus: status, checked: true });
  }

  const update: Record<string, unknown> = {
    payment_status: status,
    failure_reason: status === 'paid' ? null : str(latest.Error).slice(0, 500) || null,
  };
  if (str(confirmed.InvoiceId)) update.invoice_id = str(confirmed.InvoiceId);
  if (str(latest.PaymentId)) update.payment_id = str(latest.PaymentId);
  if (status === 'paid') update.paid_at = new Date().toISOString();

  const { error: updateError } = await admin.from('bookings').update(update).eq('id', booking.id);
  if (updateError) {
    console.error('Could not update the booking', updateError.message);
    return json({ error: 'Could not update the booking.' }, 500);
  }

  console.log('Booking reconciled by poll', { reference: booking.reference, status });
  return json({ reference: booking.reference, paymentStatus: status, checked: true });
});
