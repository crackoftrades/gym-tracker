import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '../components/Button';
import { confirmPayment, getBooking } from '../lib/payments';
import { colors, radius, shadow, spacing } from '../theme';

// Where MyFatoorah drops the buyer once checkout is over: /pay/success/<ref>
// after a payment, /pay/error/<ref> after a failure or a cancel.
//
// The URL is only a hint — it is a redirect the buyer's own browser followed,
// so it decides nothing. What the page actually reports is `payment_status` on
// the booking, which only the `payment-webhook` edge function can write. The
// webhook usually lands first; when it hasn't, this polls for a few seconds
// rather than claiming an outcome the database doesn't have yet.

const POLL_MS = 2000;
const POLL_LIMIT = 12; // ~24 seconds

const VIEWS = {
  paid: {
    icon: '✓',
    accent: colors.accent,
    title: 'You’re in',
    body: 'Payment confirmed. The course is in your library and its sessions are ready to drop into your Weekly Plan.',
  },
  waiting: {
    icon: '⋯',
    accent: colors.warn,
    title: 'Confirming your payment',
    body: 'The gateway has taken your payment and we’re waiting for it to confirm. This normally takes a few seconds.',
  },
  slow: {
    icon: '⋯',
    accent: colors.warn,
    title: 'Still confirming',
    body: 'MyFatoorah hasn’t confirmed this one yet. Nothing is lost — the confirmation is delivered to us separately, and the course appears in Courses the moment it lands.',
  },
  failed: {
    icon: '✕',
    accent: colors.danger,
    title: 'Payment didn’t go through',
    body: 'Nothing was charged. You can start the checkout again from Courses, or try a different card.',
  },
  expired: {
    icon: '⌛',
    accent: colors.danger,
    title: 'That payment link expired',
    body: 'The invoice timed out before it was paid. Start a fresh checkout from Courses.',
  },
  cancelled: {
    icon: '✕',
    accent: colors.danger,
    title: 'Checkout cancelled',
    body: 'You came back without completing the payment, so nothing was charged. The course is still there when you want it.',
  },
  unknown: {
    icon: '?',
    accent: colors.textDim,
    title: 'We can’t find that payment',
    body: 'This link doesn’t match a booking on your account. If you were charged, keep the reference below and we can trace it.',
  },
};

function viewFor({ outcome, booking, polls, signedIn }) {
  if (!signedIn) return outcome === 'success' ? VIEWS.waiting : VIEWS.cancelled;
  if (booking?.payment_status === 'paid') return VIEWS.paid;
  if (booking?.payment_status === 'expired') return VIEWS.expired;
  if (booking?.payment_status === 'failed') return VIEWS.failed;
  if (!booking && polls >= POLL_LIMIT) return VIEWS.unknown;
  // Still `pending` / `awaiting_payment`: the webhook is the only thing that
  // can move it, so trust the redirect only for the shape of the message.
  if (outcome === 'error') return VIEWS.cancelled;
  return polls >= POLL_LIMIT ? VIEWS.slow : VIEWS.waiting;
}

export default function PaymentResultScreen({ route, session, onDone }) {
  const { outcome, reference } = route;
  const [booking, setBooking] = useState(null);
  const [polls, setPolls] = useState(0);
  const [error, setError] = useState('');
  const settled = useRef(false);

  useEffect(() => {
    if (!reference || !session) return undefined;
    let alive = true;
    let timer;

    const tick = async () => {
      try {
        // Ask the gateway first, then read what got written. Without this the
        // page would wait on a webhook that never arrives when the project is
        // running on MyFatoorah's shared sandbox token.
        await confirmPayment(reference).catch(() => {});
        const row = await getBooking(reference);
        if (!alive) return;
        if (row) setBooking(row);
        if (row && ['paid', 'failed', 'expired'].includes(row.payment_status)) {
          settled.current = true;
          return; // terminal — stop asking
        }
      } catch (e) {
        if (!alive) return;
        setError(String(e?.message || e));
      }
      if (!alive || settled.current) return;
      setPolls((n) => {
        const next = n + 1;
        if (next < POLL_LIMIT) timer = setTimeout(tick, POLL_MS);
        return next;
      });
    };

    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [reference, session]);

  const view = viewFor({ outcome, booking, polls, signedIn: !!session });
  const stillChecking = !!reference && !!session && !settled.current && polls < POLL_LIMIT;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={[styles.card, shadow.card, { borderColor: view.accent + '55' }]}>
        <View style={[styles.badge, { borderColor: view.accent + '66', backgroundColor: view.accent + '1F' }]}>
          <Text style={[styles.badgeIcon, { color: view.accent }]}>{view.icon}</Text>
        </View>

        <Text style={styles.title}>{view.title}</Text>
        <Text style={styles.body}>{view.body}</Text>

        {booking?.course ? (
          <View style={styles.receipt}>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptKey}>Course</Text>
              <Text style={styles.receiptValue}>{booking.course.title}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptKey}>Amount</Text>
              <Text style={styles.receiptValue}>
                {Number(booking.amount).toFixed(3)} {booking.currency}
              </Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptKey}>Status</Text>
              <Text style={[styles.receiptValue, { color: view.accent }]}>{booking.payment_status}</Text>
            </View>
          </View>
        ) : null}

        {stillChecking ? (
          <View style={styles.pollRow}>
            <ActivityIndicator color={view.accent} size="small" />
            <Text style={styles.pollText}>Checking with the gateway…</Text>
          </View>
        ) : null}

        {reference ? <Text style={styles.reference}>Reference · {reference}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!session ? (
          <Text style={styles.error}>Sign in again to see this booking on your account.</Text>
        ) : null}

        <Button
          title={view === VIEWS.paid ? 'START TRAINING' : 'BACK TO COURSES'}
          onPress={onDone}
          style={styles.button}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing(2.5) },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing(3),
    alignSelf: 'center',
    width: '100%',
    maxWidth: 460,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  badgeIcon: { fontSize: 26, fontWeight: '900', lineHeight: 30 },
  title: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: spacing(2),
  },
  body: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: spacing(1.5),
  },
  receipt: {
    marginTop: spacing(2.5),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing(1.5),
  },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  receiptKey: { color: colors.textFaint, fontSize: 12, fontWeight: '700' },
  receiptValue: { color: colors.text, fontSize: 13, fontWeight: '800', flexShrink: 1, textAlign: 'right' },
  pollRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing(2) },
  pollText: { color: colors.textFaint, fontSize: 12, fontWeight: '700', marginLeft: 8 },
  reference: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing(2),
  },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: spacing(1.5) },
  button: { marginTop: spacing(2.5) },
});
