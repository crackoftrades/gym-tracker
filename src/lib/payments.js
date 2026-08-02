import { Linking, Platform } from 'react-native';
import { supabase } from './supabase';

// Courses, and the MyFatoorah checkout behind the Pay button.
//
// Nothing here decides what anything costs or whether it was paid for: the
// price is read server-side by the `create-payment` edge function, and
// `payment_status` is writable only by `payment-webhook`. The app just asks for
// a payment URL, sends the buyer there, and reads back what the webhook wrote.

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

export const PAYMENT_STATUS_LABEL = {
  pending: 'Starting…',
  awaiting_payment: 'Waiting for payment',
  paid: 'Enrolled',
  failed: 'Payment failed',
  expired: 'Payment link expired',
};

export async function listCourses() {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('is_active', true)
    .order('sort_index');
  if (error) throw error;
  return data ?? [];
}

// Every booking belongs to the signed-in member — RLS makes sure of it.
export async function listMyBookings() {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getBooking(reference) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, course:courses(*)')
    .eq('reference', reference)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// One booking per course in the UI: the paid one if there is one, otherwise the
// most recent attempt.
export function bookingsByCourse(bookings) {
  const map = {};
  for (const b of bookings) {
    const held = map[b.course_id];
    if (!held || (held.payment_status !== 'paid' && b.payment_status === 'paid')) map[b.course_id] = b;
  }
  return map;
}

// Asks the edge function to open a MyFatoorah invoice. Returns
// `{ paymentUrl, reference, invoiceId, ... }`.
export async function startCoursePayment(course) {
  const { data, error } = await supabase.functions.invoke('create-payment', {
    body: {
      courseId: course.id,
      // Lets previews and localhost come back to themselves. The function
      // ignores any origin it doesn't recognise.
      origin: isWeb ? window.location.origin : undefined,
    },
  });

  // Non-2xx responses arrive as FunctionsHttpError with the body on `context`.
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  if (!data?.paymentUrl) throw new Error('The payment gateway did not return a checkout link.');
  return data;
}

// Asks the gateway what happened to one booking and writes the answer, for the
// times the webhook can't. On MyFatoorah's shared sandbox token no webhook can
// ever be registered, so this is what settles a payment; with a real merchant
// account it's the backstop for a delayed or dropped event.
//
// Returns the booking's status. Safe to call repeatedly — the function
// short-circuits once a booking is settled.
export async function confirmPayment(reference) {
  const { data, error } = await supabase.functions.invoke('confirm-payment', {
    body: { reference },
  });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  return data?.paymentStatus ?? null;
}

// Nudges every unsettled booking before the Courses list is drawn, so a buyer
// who closed the tab mid-checkout still comes back to "Enrolled".
export async function reconcileBookings(bookings) {
  const open = bookings.filter((b) => b.payment_status === 'awaiting_payment');
  if (!open.length) return false;
  const results = await Promise.all(
    open.map((b) => confirmPayment(b.reference).catch(() => b.payment_status)),
  );
  return results.some((status, i) => status !== open[i].payment_status);
}

export function openPaymentUrl(url) {
  if (isWeb) window.location.assign(url);
  else Linking.openURL(url);
}

// ------------------------------------------------------------ return routes --
// MyFatoorah sends the buyer back to /pay/success/<reference> or
// /pay/error/<reference> and appends its own ?paymentId=…&Id=… . vercel.json
// rewrites every path to index.html, so these arrive here as a plain path read.

export function readPaymentRoute() {
  if (!isWeb) return null;
  const match = window.location.pathname.match(/^\/pay\/(success|error)(?:\/([^/?#]+))?/);
  if (!match) return null;
  const params = new URLSearchParams(window.location.search);
  return {
    outcome: match[1],
    reference: match[2] ? decodeURIComponent(match[2]) : params.get('ref') || '',
    paymentId: params.get('paymentId') || '',
  };
}

// Drops the /pay/... path so a reload doesn't land back on the receipt.
export function clearPaymentRoute() {
  if (isWeb) window.history.replaceState(null, '', '/');
}
