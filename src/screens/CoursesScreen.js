import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Button from '../components/Button';
import Chip from '../components/Chip';
import Tag from '../components/Tag';
import {
  bookingsByCourse,
  listCourses,
  listMyBookings,
  openPaymentUrl,
  startCoursePayment,
} from '../lib/payments';
import { colors, gradients, radius, shadow, splitColor, spacing } from '../theme';

const LEVEL_COLOR = { Beginner: colors.accent, Intermediate: colors.primary, Advanced: colors.warn };

// KWD is a three-decimal currency — 12.5 is twelve and a half dinars, not
// twelve fifty, and rounding it to two decimals would quietly change the price.
function price(course) {
  const value = Number(course.price);
  const decimals = course.currency === 'KWD' || course.currency === 'BHD' || course.currency === 'OMR' ? 3 : 2;
  return `${value.toFixed(decimals)} ${course.currency}`;
}

function CourseCard({ course, booking, busy, error, onPay, onResume }) {
  const paid = booking?.payment_status === 'paid';
  const waiting = booking?.payment_status === 'awaiting_payment' && booking?.payment_url;
  const level = LEVEL_COLOR[course.level] ?? colors.primary;

  return (
    <View style={[styles.card, shadow.card, paid && styles.cardOwned]}>
      <View style={styles.cardHead}>
        <View style={styles.cardHeadText}>
          <Text style={styles.cardTitle}>{course.title}</Text>
          <Text style={styles.cardSubtitle}>{course.subtitle}</Text>
        </View>
        {paid ? (
          <View style={styles.ownedBadge}>
            <Text style={styles.ownedBadgeText}>ENROLLED</Text>
          </View>
        ) : (
          <Text style={styles.price}>{price(course)}</Text>
        )}
      </View>

      <View style={styles.tags}>
        <Tag label={course.level} color={level} solid />
        <View style={styles.tagGap} />
        <Tag label={course.focus} color={splitColor[course.focus] ?? colors.textDim} />
        <View style={styles.tagGap} />
        <Tag label={`${course.weeks} weeks`} />
        <View style={styles.tagGap} />
        <Tag label={`${course.sessions_per_week}×/week`} />
      </View>

      <Text style={styles.description}>{course.description}</Text>

      {(course.highlights ?? []).map((h) => (
        <View key={h} style={styles.bulletRow}>
          <Text style={[styles.bulletDot, { color: level }]}>▸</Text>
          <Text style={styles.bulletText}>{h}</Text>
        </View>
      ))}

      {error ? <Text style={styles.cardError}>{error}</Text> : null}

      {paid ? (
        <Text style={styles.ownedNote}>
          Paid {booking.paid_at ? new Date(booking.paid_at).toLocaleDateString() : ''} · {booking.reference}
        </Text>
      ) : waiting ? (
        <View>
          <Text style={styles.waitingNote}>
            An invoice is already open for this course. Finish it or start a new one.
          </Text>
          <Button
            title="CONTINUE PAYMENT"
            onPress={() => onResume(booking)}
            style={styles.payButton}
          />
          <Button title="START OVER" variant="ghost" onPress={() => onPay(course)} loading={busy} style={styles.secondButton} />
        </View>
      ) : (
        <Button
          title={`PAY ${price(course)}`}
          onPress={() => onPay(course)}
          loading={busy}
          style={styles.payButton}
        />
      )}
    </View>
  );
}

export default function CoursesScreen({ reloadSignal }) {
  const [courses, setCourses] = useState([]);
  const [bookings, setBookings] = useState({});
  const [level, setLevel] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [payError, setPayError] = useState({});

  const load = useCallback(async () => {
    const [courseRows, bookingRows] = await Promise.all([listCourses(), listMyBookings()]);
    setCourses(courseRows);
    setBookings(bookingsByCourse(bookingRows));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then(() => alive && setError(''))
      .catch((e) => alive && setError(String(e?.message || e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load, reloadSignal]);

  // The gateway takes over the tab from here, so there is no "success" state to
  // render — only the failure to open the invoice at all.
  const pay = useCallback(async (course) => {
    setBusyId(course.id);
    setPayError((prev) => ({ ...prev, [course.id]: '' }));
    try {
      const { paymentUrl } = await startCoursePayment(course);
      openPaymentUrl(paymentUrl);
    } catch (e) {
      setPayError((prev) => ({ ...prev, [course.id]: String(e?.message || e) }));
      setBusyId(null);
      // An "already owned" answer means our list is stale.
      load().catch(() => {});
    }
  }, [load]);

  const levels = ['all', ...Array.from(new Set(courses.map((c) => c.level)))];
  const shown = level === 'all' ? courses : courses.filter((c) => c.level === level);
  const owned = Object.values(bookings).filter((b) => b.payment_status === 'paid').length;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Courses</Text>
        <Text style={styles.count}>{courses.length}</Text>
      </View>

      <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Text style={styles.heroLabel}>Pre-planned training</Text>
        <Text style={styles.heroBody}>
          Blocks written start to finish — every session, every rep target, every progression already
          decided. Buy one and it drops straight into your Weekly Plan.
        </Text>
        {owned > 0 ? (
          <Text style={styles.heroOwned}>
            {owned} course{owned === 1 ? '' : 's'} in your library
          </Text>
        ) : null}
      </LinearGradient>

      {courses.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
          {levels.map((l) => (
            <Chip
              key={l}
              label={l === 'all' ? 'All levels' : l}
              active={level === l}
              accent={LEVEL_COLOR[l] ?? colors.primary}
              onPress={() => setLevel(l)}
            />
          ))}
        </ScrollView>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing(4) }} />
      ) : error ? (
        <Text style={styles.error}>Couldn’t load the courses.{'\n'}{error}</Text>
      ) : shown.length === 0 ? (
        <Text style={styles.empty}>No courses at this level yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {shown.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              booking={bookings[course.id]}
              busy={busyId === course.id}
              error={payError[course.id]}
              onPay={pay}
              onResume={(booking) => openPaymentUrl(booking.payment_url)}
            />
          ))}
          <Text style={styles.footnote}>
            Payments run through MyFatoorah’s test gateway while the app is in demo — no real money
            moves. Use any of MyFatoorah’s sandbox cards at checkout.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing(2.5),
    paddingTop: spacing(1),
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '900' },
  count: { color: colors.textFaint, fontSize: 13, fontWeight: '800' },

  hero: {
    marginHorizontal: spacing(2.5),
    marginTop: spacing(1.5),
    borderRadius: radius.lg,
    padding: spacing(2),
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroBody: { color: colors.white, fontSize: 13, lineHeight: 19, marginTop: 6 },
  heroOwned: { color: colors.lime, fontSize: 12, fontWeight: '800', marginTop: 10 },

  // flexShrink: 0 keeps the row at its own height — without it the flex parent
  // squashes the chips to a sliver behind the list.
  filterScroll: { flexGrow: 0, flexShrink: 0, marginTop: spacing(1.5) },
  filterRow: { paddingHorizontal: spacing(2.5) },

  list: { padding: spacing(2.5), paddingTop: spacing(1) },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2),
    marginBottom: spacing(2),
  },
  cardOwned: { borderColor: colors.accent + '66' },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardHeadText: { flex: 1, paddingRight: spacing(1.5) },
  cardTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  cardSubtitle: { color: colors.textDim, fontSize: 13, marginTop: 3 },
  price: { color: colors.lime, fontSize: 15, fontWeight: '900' },
  ownedBadge: {
    borderWidth: 1,
    borderColor: colors.accent + '66',
    backgroundColor: colors.accent + '1F',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ownedBadgeText: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: spacing(1.5) },
  tagGap: { width: 6 },

  description: { color: colors.textDim, fontSize: 13, lineHeight: 20, marginTop: spacing(1.5) },

  bulletRow: { flexDirection: 'row', marginTop: 7 },
  bulletDot: { fontSize: 12, fontWeight: '900', marginRight: 8, marginTop: 1 },
  bulletText: { color: colors.text, fontSize: 13, lineHeight: 18, flex: 1 },

  cardError: { color: colors.danger, fontSize: 12, lineHeight: 17, marginTop: spacing(1.5) },
  waitingNote: { color: colors.warn, fontSize: 12, lineHeight: 17, marginTop: spacing(1.5) },
  ownedNote: { color: colors.textFaint, fontSize: 11, fontWeight: '700', marginTop: spacing(2) },

  payButton: { marginTop: spacing(2) },
  secondButton: { marginTop: spacing(1) },

  error: { color: colors.danger, fontSize: 13, lineHeight: 19, padding: spacing(2.5), textAlign: 'center' },
  empty: { color: colors.textFaint, fontSize: 13, padding: spacing(2.5), textAlign: 'center' },
  footnote: {
    color: colors.textFaint,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: spacing(0.5),
    marginBottom: spacing(2),
  },
});
