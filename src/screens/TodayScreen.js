import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Tag from '../components/Tag';
import { listLogs, listPlan } from '../lib/db';
import { daysAgoIso, logVolume, prettyDate } from '../lib/metrics';
import { colors, gradients, radius, splitColor, spacing } from '../theme';

function todayLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function TodayScreen({ reloadSignal, coaching, onLog, onOpenExercise, onGoPlan }) {
  const [days, setDays] = useState([]);
  const [recent, setRecent] = useState([]);
  const [weekLogs, setWeekLogs] = useState([]);
  const [openDay, setOpenDay] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([listPlan(), listLogs({}), listLogs({ from: daysAgoIso(6) })])
      .then(([p, all, week]) => {
        if (!alive) return;
        setDays(p);
        setRecent(all.slice(0, 4));
        setWeekLogs(week);
        if (p.length && openDay === null) setOpenDay(p[0].id);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadSignal]);

  const weekVolume = weekLogs.reduce((s, l) => s + logVolume(l), 0);
  const active = days.find((d) => d.id === openDay);

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing(6) }} />;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.date}>{todayLabel()}</Text>
      <Text style={styles.title}>Today</Text>

      <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Text style={styles.heroLabel}>This week</Text>
        <View style={styles.heroStats}>
          <View>
            <Text style={styles.heroNum}>{weekLogs.length}</Text>
            <Text style={styles.heroSub}>sessions</Text>
          </View>
          <View>
            <Text style={styles.heroNum}>{Math.round(weekVolume).toLocaleString()}</Text>
            <Text style={styles.heroSub}>kg volume</Text>
          </View>
          <View>
            <Text style={styles.heroNum}>{new Set(weekLogs.map((l) => l.exercise_name)).size}</Text>
            <Text style={styles.heroSub}>exercises</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Your training days</Text>
        <Pressable onPress={onGoPlan} hitSlop={8}>
          <Text style={styles.link}>Edit plan</Text>
        </Pressable>
      </View>

      {days.length === 0 ? (
        <Pressable onPress={onGoPlan} style={styles.emptyPlan}>
          <Text style={styles.emptyPlanText}>No plan yet — tap to build your weekly split.</Text>
        </Pressable>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
            {days.map((d) => (
              <Pressable
                key={d.id}
                onPress={() => setOpenDay(d.id)}
                style={[styles.dayTab, openDay === d.id && styles.dayTabActive]}
              >
                <Text style={[styles.dayTabText, openDay === d.id && styles.dayTabTextActive]}>{d.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {active && (
            <View style={styles.dayBox}>
              {(active.items || []).length === 0 ? (
                <Text style={styles.noExercises}>No exercises on this day yet. Add some in the plan.</Text>
              ) : (
                active.items.map((it) => (
                  <View key={it.id} style={styles.exRow}>
                    <Pressable style={{ flex: 1 }} onPress={() => it.exercise && onOpenExercise(it.exercise)}>
                      <Text style={styles.exName}>{it.exercise?.name || 'Exercise'}</Text>
                      <Text style={styles.exMeta}>
                        {it.target_sets} × {it.target_rep_low}–{it.target_rep_high}
                      </Text>
                    </Pressable>
                    <Pressable style={styles.logBtn} onPress={() => it.exercise && onLog(it.exercise)}>
                      <Text style={styles.logBtnText}>Log</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          )}
        </>
      )}

      <Text style={[styles.sectionTitle, { marginTop: spacing(3), marginBottom: spacing(1.5) }]}>Recent activity</Text>
      {recent.length === 0 ? (
        <Text style={styles.noExercises}>Nothing logged yet. Pick an exercise and log your first set 💪</Text>
      ) : (
        recent.map((l) => {
          const pending = coaching?.id === l.id && !coaching?.error && !l.ai_summary;
          const failed = coaching?.id === l.id && !!coaching?.error && !l.ai_summary;
          return (
            <View key={l.id} style={styles.recentRow}>
              <View style={styles.recentTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentName}>{l.exercise_name}</Text>
                  <Text style={styles.recentMeta}>
                    {prettyDate(l.performed_on)} · {l.sets.length} sets · {Math.round(logVolume(l))} kg
                  </Text>
                </View>
                {!!l.split_day && <Tag label={l.split_day} color={splitColor[l.split_day] || colors.textDim} />}
              </View>

              {pending && (
                <View style={styles.coachBox}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={styles.coachPending}>Coach is writing your summary…</Text>
                </View>
              )}
              {failed && <Text style={styles.coachFailed}>Coach summary unavailable right now.</Text>}
              {!!l.ai_summary && (
                <View style={styles.coachBox}>
                  <Text style={styles.coachLabel}>Coach</Text>
                  <Text style={styles.coachText}>{l.ai_summary}</Text>
                </View>
              )}
            </View>
          );
        })
      )}
      <View style={{ height: spacing(3) }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing(2.5) },
  date: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: 2 },
  hero: { borderRadius: radius.lg, padding: spacing(2.5), marginTop: spacing(2) },
  heroLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  heroStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(1.5) },
  heroNum: { color: colors.white, fontSize: 26, fontWeight: '900' },
  heroSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing(3),
    marginBottom: spacing(1.5),
  },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  link: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  emptyPlan: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    padding: spacing(2.5),
    alignItems: 'center',
  },
  emptyPlanText: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
  dayTabs: { paddingBottom: spacing(1) },
  dayTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginRight: 8,
  },
  dayTabActive: { backgroundColor: colors.primary + '22', borderColor: colors.primary },
  dayTabText: { color: colors.textDim, fontWeight: '800', fontSize: 14 },
  dayTabTextActive: { color: colors.primary },
  dayBox: { marginTop: spacing(1) },
  noExercises: { color: colors.textDim, fontSize: 14, lineHeight: 21 },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  exName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  exMeta: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  logBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  logBtnText: { color: colors.white, fontWeight: '900', fontSize: 14 },
  recentRow: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  recentTop: { flexDirection: 'row', alignItems: 'center' },
  recentName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  recentMeta: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  coachBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.cardAlt,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginTop: 12,
  },
  coachLabel: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginRight: 8,
    marginTop: 2,
  },
  coachText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  coachPending: { color: colors.textDim, fontSize: 13, marginLeft: 8 },
  coachFailed: { color: colors.textFaint, fontSize: 12, marginTop: 10 },
});
