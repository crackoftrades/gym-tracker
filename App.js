import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

import TodayScreen from './src/screens/TodayScreen';
import PlanScreen from './src/screens/PlanScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import ProgressScreen from './src/screens/ProgressScreen';
import CoursesScreen from './src/screens/CoursesScreen';
import ExerciseDetailScreen from './src/screens/ExerciseDetailScreen';
import PaymentResultScreen from './src/screens/PaymentResultScreen';
import AuthScreen from './src/screens/AuthScreen';
import LogSheet from './src/components/LogSheet';
import AccountSheet from './src/components/AccountSheet';

import { supabase } from './src/lib/supabase';
import { accountLabel } from './src/lib/auth';
import { getExercise } from './src/lib/db';
import { summarizeWorkout } from './src/lib/coach';
import { clearPaymentRoute, readPaymentRoute } from './src/lib/payments';
import { colors, gradients } from './src/theme';

const TABS = [
  { key: 'today', label: 'Today', icon: '⌂' },
  { key: 'plan', label: 'Plan', icon: '▤' },
  { key: 'library', label: 'Exercises', icon: '≣' },
  { key: 'courses', label: 'Courses', icon: '🎓' },
  { key: 'progress', label: 'Progress', icon: '📈' },
];

function BottomNav({ tab, setTab }) {
  return (
    <View style={styles.nav}>
      {TABS.map((t) => {
        const active = tab === t.key;
        return (
          <Pressable key={t.key} style={styles.navItem} onPress={() => setTab(t.key)}>
            <Text style={[styles.navIcon, active && styles.navActive]}>{t.icon}</Text>
            <Text style={[styles.navLabel, active && styles.navActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StartupError({ message, onRetry }) {
  return (
    <View style={styles.errorWrap}>
      <Text style={styles.errorEmoji}>🏋️</Text>
      <Text style={styles.errorTitle}>Can’t reach your account</Text>
      <Text style={styles.errorBody}>{message}</Text>
      <Pressable onPress={onRetry} style={styles.retry} hitSlop={8}>
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState('today');
  const [detail, setDetail] = useState(null);
  const [logging, setLogging] = useState(null);
  const [reload, setReload] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [coaching, setCoaching] = useState(null); // { id, error } while a summary is in flight
  const [account, setAccount] = useState(false);
  // Set when MyFatoorah has just sent the buyer back to /pay/success/<ref> or
  // /pay/error/<ref>. Read once on boot — the redirect is a full page load.
  const [payRoute, setPayRoute] = useState(readPaymentRoute);

  useEffect(() => {
    let alive = true;
    // Fires for the restored session on boot and for every sign-in / sign-out
    // afterwards, so this single listener drives the auth gate below.
    //
    // The state update is deferred a tick on purpose: supabase-js holds an
    // internal auth lock for the duration of this callback, and the screens
    // this render mounts query immediately. Fetching inside the lock resolves
    // with no access token, so a fresh sign-in would land on an empty app
    // until the user reloaded.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!alive) return;
      setTimeout(() => {
        if (!alive) return;
        setSession(s ?? null);
        // Never leave one account's screens standing in front of the next one.
        if (!s) {
          setAccount(false);
          setDetail(null);
          setLogging(null);
          setCoaching(null);
          setTab('today');
        }
      }, 0);
    });

    setSession(undefined);
    setAuthError('');
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) throw error;
        setSession(data.session ?? null);
      })
      .catch((e) => {
        if (!alive) return;
        setAuthError(String(e?.message || e));
        setSession(null);
      });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [attempt]);

  const openExercise = useCallback((ex) => setDetail(ex), []);
  const openExerciseId = useCallback(async (id) => {
    try {
      setDetail(await getExercise(id));
    } catch (e) {
      // ignore — stale id
    }
  }, []);
  const startLog = useCallback((ex) => setLogging(ex), []);

  // Saving a workout refreshes the lists right away, then quietly asks the
  // edge-function coach for its blurb and refreshes again once it lands.
  const onSaved = useCallback((log) => {
    setReload((n) => n + 1);
    if (!log?.id) return;
    setCoaching({ id: log.id, error: '' });
    summarizeWorkout(log)
      .then(() => setCoaching(null))
      .catch((e) => setCoaching({ id: log.id, error: String(e?.message || e) }))
      .finally(() => setReload((n) => n + 1));
  }, []);

  // Leaving the receipt drops the /pay/... path so a reload doesn't land back
  // on it, and refreshes Courses with whatever the webhook has written by now.
  const leavePayment = useCallback(() => {
    clearPaymentRoute();
    setPayRoute(null);
    setTab('courses');
    setReload((n) => n + 1);
  }, []);

  const body = () => {
    if (session === undefined) {
      return <ActivityIndicator color={colors.primary} style={{ flex: 1 }} />;
    }

    // Shown ahead of the auth gate: a buyer coming back from the gateway should
    // see what happened to their money even if their session has lapsed.
    if (payRoute) {
      return <PaymentResultScreen route={payRoute} session={session} onDone={leavePayment} />;
    }

    // Only a failed session lookup is an error worth a retry screen; simply
    // being signed out is the normal path to the sign-in form.
    if (!session) {
      return authError ? (
        <StartupError message={authError} onRetry={() => setAttempt((n) => n + 1)} />
      ) : (
        <AuthScreen />
      );
    }

    if (detail) {
      return (
        <ExerciseDetailScreen exercise={detail} onBack={() => setDetail(null)} onLog={startLog} />
      );
    }

    return (
      <View style={styles.flex}>
        <View style={styles.topbar}>
          <Text style={styles.brand}>Gym Tracker</Text>
          <Pressable onPress={() => setAccount(true)} hitSlop={8}>
            <Text style={styles.accountChip} numberOfLines={1}>
              {accountLabel(session)}
            </Text>
          </Pressable>
        </View>
        <View style={styles.flex}>
          {tab === 'today' && (
            <TodayScreen
              reloadSignal={reload}
              coaching={coaching}
              onLog={startLog}
              onOpenExercise={openExercise}
              onGoPlan={() => setTab('plan')}
            />
          )}
          {tab === 'plan' && <PlanScreen onOpenExercise={openExercise} />}
          {tab === 'library' && <LibraryScreen onOpenExercise={openExercise} />}
          {tab === 'courses' && <CoursesScreen reloadSignal={reload} />}
          {tab === 'progress' && <ProgressScreen reloadSignal={reload} onOpenExerciseId={openExerciseId} />}
        </View>
        <BottomNav tab={tab} setTab={setTab} />
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <ExpoStatusBar style="light" />
      <SafeAreaView style={styles.safe}>{body()}</SafeAreaView>
      <LogSheet
        visible={!!logging}
        exercise={logging}
        onClose={() => setLogging(null)}
        onSaved={onSaved}
      />
      <AccountSheet visible={account} session={session} onClose={() => setAccount(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  safe: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  brand: { color: colors.textDim, fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  accountChip: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: 'hidden',
    maxWidth: 190,
  },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  errorEmoji: { fontSize: 44 },
  errorTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 10,
    textAlign: 'center',
  },
  errorBody: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    textAlign: 'center',
    maxWidth: 420,
  },
  retry: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  nav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgAlt,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 6 : 8,
  },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  navIcon: { fontSize: 20, color: colors.textFaint },
  navLabel: { fontSize: 11, color: colors.textFaint, fontWeight: '700', marginTop: 2 },
  navActive: { color: colors.primary },
});
