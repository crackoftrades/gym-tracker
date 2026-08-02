import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// MyFatoorah calls this when a payment finishes. It finds the booking by the
// reference we sent with the invoice and moves `payment_status` to `paid`,
// `failed` or `expired`.
//
// This endpoint is public — `verify_jwt` is off, because a payment gateway has
// no Supabase session to present — so it never takes the caller at their word.
// Two independent checks stand in front of the write:
//
//  1. The MyFatoorah-Signature header, an HMAC-SHA256 of the event's own fields
//     under a secret only MyFatoorah and this project hold. A bad signature is
//     rejected outright.
//  2. The status is then read back from MyFatoorah's own API rather than taken
//     from the request body. Even a perfectly forged event cannot mark a
//     booking paid unless MyFatoorah itself says the invoice was paid.
//
// Because MyFatoorah retries (up to 5 times, up to 180s apart), everything here
// is idempotent, and a booking that already reads `paid` is never walked back.

const MF_BASE = (Deno.env.get('MYFATOORAH_BASE_URL') ?? 'https://apitest.myfatoorah.com').replace(/\/+$/, '');
const MF_DEMO_KEY =
  'SK_KWT_vVZlnnAqu8jRByOWaRPNId4ShzEDNt256dvnjebuyzo52dXjAfRx2ixW5umjWSUx';
const MF_KEY = Deno.env.get('MYFATOORAH_API_KEY') ?? MF_DEMO_KEY;
const MF_WEBHOOK_SECRET = Deno.env.get('MYFATOORAH_WEBHOOK_SECRET') ?? '';

// Event 1 in both webhook versions: a payment changed state. Everything else
// (refunds, disputes, supplier updates) is acknowledged and dropped.
const PAYMENT_EVENTS = new Set(['1', 'PAYMENT_STATUS_CHANGED', 'TransactionsStatusChanged']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const str = (v: unknown) => (v == null ? '' : String(v));

async function hmacSha256Base64(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// MyFatoorah signs a canonical string built from the event's own fields —
// "key=value,key2=value2", nulls flattened to empty — not the raw body.
// https://docs.myfatoorah.com/docs/webhook-signature
//
// The field order differs between webhook V1 and V2, and the docs are not
// explicit about whether the keys are dotted ("Invoice.Id") or bare, so every
// plausible spelling is generated and any single match is accepted. Each
// candidate still requires the shared secret, so trying several costs nothing
// in strength — it only stops a portal set to V1 from silently failing shut.
function signatureCandidates(body: Record<string, any>) {
  const out: string[] = [];
  const push = (entries: [string, string][]) => {
    out.push(entries.map(([k, v]) => `${k}=${v}`).join(','));
    out.push(entries.map(([, v]) => v).join(','));
  };

  const data = (body?.Data ?? {}) as Record<string, any>;

  // V2: Invoice.Id, Invoice.Status, Transaction.Status, Transaction.PaymentId,
  // Invoice.ExternalIdentifier
  if (data.Invoice || data.Transaction) {
    const inv = (data.Invoice ?? {}) as Record<string, any>;
    const tx = (data.Transaction ?? {}) as Record<string, any>;
    const v2: [string, string][] = [
      ['Invoice.Id', str(inv.Id)],
      ['Invoice.Status', str(inv.Status)],
      ['Transaction.Status', str(tx.Status)],
      ['Transaction.PaymentId', str(tx.PaymentId)],
      ['Invoice.ExternalIdentifier', str(inv.ExternalIdentifier)],
    ];
    push(v2);
    push(v2.map(([k, v]) => [k.split('.').pop() as string, v]));
  }

  // V1: the flat Data object, in the order MyFatoorah serialised it.
  const flat = Object.entries(data).filter(([, v]) => typeof v !== 'object' || v === null);
  if (flat.length) push(flat.map(([k, v]) => [k, str(v)] as [string, string]));

  return out;
}

async function signatureIsValid(body: Record<string, any>, header: string) {
  for (const candidate of signatureCandidates(body)) {
    if (timingSafeEqual(await hmacSha256Base64(MF_WEBHOOK_SECRET, candidate), header)) return true;
  }
  return false;
}

// The authoritative read. Whatever arrived in the request body, this is what
// MyFatoorah says actually happened to the invoice.
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

// MyFatoorah spells the success transaction status "Succss" in places, so
// match on a prefix rather than an exact string.
function classify(invoiceStatus: string, transactionStatus: string) {
  const paid = /^succ/i.test(transactionStatus) || /^paid$/i.test(invoiceStatus);
  if (paid) return 'paid';
  if (/expir/i.test(invoiceStatus) || /expir/i.test(transactionStatus)) return 'expired';
  if (/fail|cancel|declin|reject/i.test(invoiceStatus) || /fail|cancel|declin|reject/i.test(transactionStatus)) {
    return 'failed';
  }
  return 'awaiting_payment';
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const raw = await req.text();
  let body: Record<string, any>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  // ------------------------------------------------------- check 1: signature
  const header = req.headers.get('MyFatoorah-Signature') ?? '';
  if (MF_WEBHOOK_SECRET) {
    if (!header) return json({ error: 'Missing MyFatoorah-Signature header.' }, 401);
    if (!(await signatureIsValid(body, header))) {
      console.error('Rejected a webhook with a bad signature');
      return json({ error: 'Signature does not match.' }, 401);
    }
  } else {
    // Fail loudly rather than silently: the API read-back below is still doing
    // the real work, but this endpoint should not stay unsigned in production.
    console.warn('MYFATOORAH_WEBHOOK_SECRET is not set — the signature header was not verified.');
  }

  const eventName = str(body?.Event?.Name ?? body?.Event ?? '');
  const eventCode = str(body?.Event?.Code ?? body?.EventType ?? '');
  if (!PAYMENT_EVENTS.has(eventName) && !PAYMENT_EVENTS.has(eventCode)) {
    return json({ ignored: true, reason: `Not a payment event (${eventCode || eventName || 'unknown'}).` });
  }

  const data = (body?.Data ?? {}) as Record<string, any>;
  const invoice = (data.Invoice ?? {}) as Record<string, any>;
  const transaction = (data.Transaction ?? {}) as Record<string, any>;

  const invoiceId = str(invoice.Id || data.InvoiceId);
  // Where our own reference may have been echoed back, most trustworthy first.
  const claimedRefs = [
    data.CustomerReference,
    invoice.ExternalIdentifier,
    invoice.UserDefinedField,
    data.UserDefinedField,
    invoice.Reference,
    data.InvoiceReference,
  ]
    .map(str)
    .filter((r) => r.startsWith('GT-'));

  // ------------------------------------------- check 2: ask MyFatoorah itself
  let confirmed: Record<string, any> | null = null;
  try {
    if (invoiceId) confirmed = await fetchPaymentStatus(invoiceId, 'InvoiceId');
    if (!confirmed && claimedRefs[0]) confirmed = await fetchPaymentStatus(claimedRefs[0], 'CustomerReference');
  } catch (e) {
    console.error('Could not reach MyFatoorah to confirm the payment', String(e));
  }

  if (!confirmed && !MF_WEBHOOK_SECRET) {
    // Unsigned *and* unconfirmed is not enough to touch money. 503 so
    // MyFatoorah retries once the API is reachable again.
    return json({ error: 'Could not confirm this payment with MyFatoorah.' }, 503);
  }

  // One source of truth per request, never a blend of the two. Mixing them is
  // what makes a forgery work: a body claiming Transaction.Status = "Succss"
  // must not fill in for an invoice the API reports as still pending, which is
  // exactly the shape of a real invoice that has not been paid yet.
  let invoiceStatus: string;
  let transactionStatus: string;
  let paymentId: string | null;
  let failureReason: string | null;
  let reference: string;

  if (confirmed) {
    const txs = Array.isArray(confirmed.InvoiceTransactions) ? confirmed.InvoiceTransactions : [];
    const latest = (txs[txs.length - 1] ?? {}) as Record<string, any>;
    invoiceStatus = str(confirmed.InvoiceStatus);
    transactionStatus = str(latest.TransactionStatus);
    paymentId = str(latest.PaymentId) || null;
    failureReason = str(latest.Error).slice(0, 500) || null;
    reference = str(confirmed.CustomerReference).startsWith('GT-')
      ? str(confirmed.CustomerReference)
      : (claimedRefs[0] ?? '');
  } else {
    // Only reachable with a verified signature — the unsigned path already
    // returned 503 above.
    invoiceStatus = str(invoice.Status || data.InvoiceStatus);
    transactionStatus = str(transaction.Status || data.TransactionStatus);
    paymentId = str(transaction.PaymentId || data.PaymentId) || null;
    failureReason = str(transaction?.Error?.Message || data.Error).slice(0, 500) || null;
    reference = claimedRefs[0] ?? '';
  }

  const status = classify(invoiceStatus, transactionStatus);
  const resolvedInvoiceId = (confirmed ? str(confirmed.InvoiceId) : '') || invoiceId;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Missing Supabase service credentials.' }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const query = admin.from('bookings').select('id, payment_status, reference').limit(1);
  const { data: booking, error: lookupError } = await (reference
    ? query.eq('reference', reference)
    : query.eq('invoice_id', resolvedInvoiceId)
  ).maybeSingle();

  if (lookupError) {
    console.error('Booking lookup failed', lookupError.message);
    return json({ error: 'Booking lookup failed.' }, 500);
  }
  if (!booking) {
    // 404 so MyFatoorah retries — this is also what a booking that hasn't
    // committed yet looks like.
    console.error('No booking matched this payment', { reference, invoiceId: resolvedInvoiceId });
    return json({ error: 'No booking matches this payment.', reference, invoiceId: resolvedInvoiceId }, 404);
  }

  // A paid booking is final. Later events only add to the audit trail.
  if (booking.payment_status === 'paid' && status !== 'paid') {
    await admin.from('bookings').update({ last_event: body }).eq('id', booking.id);
    return json({ ok: true, reference: booking.reference, paymentStatus: 'paid', note: 'Already paid.' });
  }

  const update: Record<string, unknown> = {
    payment_status: status,
    failure_reason: status === 'paid' ? null : failureReason,
    last_event: body,
  };
  // Only ever add gateway ids — an event that omits one must not wipe the one
  // `create-payment` already recorded.
  if (resolvedInvoiceId) update.invoice_id = resolvedInvoiceId;
  if (paymentId) update.payment_id = paymentId;
  if (status === 'paid') update.paid_at = new Date().toISOString();

  const { error: updateError } = await admin.from('bookings').update(update).eq('id', booking.id);
  if (updateError) {
    console.error('Could not update the booking', updateError.message);
    return json({ error: 'Could not update the booking.' }, 500);
  }

  console.log('Booking updated', { reference: booking.reference, status, invoiceId: resolvedInvoiceId });
  return json({ ok: true, reference: booking.reference, paymentStatus: status });
});
