import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

import TodayScreen from './src/screens/TodayScreen';
import PlanScreen from './src/screens/PlanScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import ProgressScreen from './src/screens/ProgressScreen';
import ExerciseDetailScreen from './src/screens/ExerciseDetailScreen';
import LogSheet from './src/components/LogSheet';

import { supabase, ensureDemoSession } from './src/lib/supabase';
import { getExercise } from './src/lib/db';
import { colors, gradients } from './src/theme';

const TABS = [
  { key: 'today', label: 'Today', icon: '⌂' },
  { key: 'plan', label: 'Plan', icon: '▤' },
  { key: 'library', label: 'Exercises', icon: '≣' },
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
      <Text style={styles.errorTitle}>Can’t start the demo</Text>
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

  useEffect(() => {
    let alive = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (alive && s) setSession(s);
    });

    setSession(undefined);
    setAuthError('');
    ensureDemoSession()
      .then((s) => {
        if (!alive) return;
        setSession(s);
      })
      .catch((e) => {
        if (!alive) return;
        const raw = String(e?.message || e);
        setAuthError(
          /anonymous/i.test(raw)
            ? 'Anonymous sign-ins are disabled for this Supabase project. Enable them under Authentication → Sign In / Providers, then try again.'
            : raw,
        );
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
  const onSaved = useCallback(() => setReload((n) => n + 1), []);

  const body = () => {
    if (session === undefined) {
      return <ActivityIndicator color={colors.primary} style={{ flex: 1 }} />;
    }
    if (!session) {
      return <StartupError message={authError} onRetry={() => setAttempt((n) => n + 1)} />;
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
          <Text style={styles.demoBadge}>Demo</Text>
        </View>
        <View style={styles.flex}>
          {tab === 'today' && (
            <TodayScreen
              reloadSignal={reload}
              onLog={startLog}
              onOpenExercise={openExercise}
              onGoPlan={() => setTab('plan')}
            />
          )}
          {tab === 'plan' && <PlanScreen onOpenExercise={openExercise} />}
          {tab === 'library' && <LibraryScreen onOpenExercise={openExercise} />}
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
  demoBadge: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: 'hidden',
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
