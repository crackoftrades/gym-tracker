import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Chip from '../components/Chip';
import ProgressPhoto from '../components/ProgressPhoto';
import Tag from '../components/Tag';
import { listLogs } from '../lib/db';
import { CATEGORIES, COACH_NAME, DATE_RANGES, SPLIT_DAYS } from '../lib/constants';
import {
  bestE1RM,
  daysAgoIso,
  logVolume,
  markPRs,
  prettyDate,
  progressStatus,
  statusMeta,
  topWeight,
} from '../lib/metrics';
import { categoryColor, colors, radius, splitColor, spacing } from '../theme';

// Tiny bar chart of top-set weight across sessions.
function MiniBars({ series }) {
  const max = Math.max(1, ...series);
  return (
    <View style={styles.bars}>
      {series.slice(-12).map((v, i) => (
        <View key={i} style={styles.barTrack}>
          <View style={[styles.barFill, { height: `${Math.max(6, (v / max) * 100)}%` }]} />
        </View>
      ))}
    </View>
  );
}

export default function ProgressScreen({ reloadSignal, onOpenExerciseId }) {
  const [category, setCategory] = useState('all');
  const [splitDay, setSplitDay] = useState('all');
  const [range, setRange] = useState('all');
  const [view, setView] = useState('exercises'); // 'exercises' | 'timeline'
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const preset = DATE_RANGES.find((r) => r.key === range);
    const from = preset?.days ? daysAgoIso(preset.days - 1) : undefined;
    listLogs({ category, splitDay, from })
      .then((d) => alive && (setLogs(d), setError('')))
      .catch((e) => alive && setError(String(e?.message || e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [category, splitDay, range, reloadSignal]);

  const { groups, prIds, totalVolume, prCount } = useMemo(() => {
    const byEx = new Map();
    for (const l of logs) {
      const key = l.exercise_id || l.exercise_name;
      if (!byEx.has(key)) byEx.set(key, []);
      byEx.get(key).push(l);
    }
    const prIds = new Set();
    const groups = [];
    for (const [key, arr] of byEx) {
      const asc = [...arr].sort((a, b) => a.performed_on.localeCompare(b.performed_on));
      const marked = markPRs(asc);
      marked.forEach((m) => m.isPR && prIds.add(m.id));
      groups.push({
        key,
        exerciseId: arr[0].exercise_id,
        name: arr[0].exercise_name,
        category: arr[0].category,
        split_day: arr[0].split_day,
        sessions: asc.length,
        status: progressStatus(asc),
        best: Math.max(...asc.map(bestE1RM)),
        series: asc.map(topWeight),
        lastDate: asc[asc.length - 1].performed_on,
      });
    }
    groups.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
    const totalVolume = logs.reduce((s, l) => s + logVolume(l), 0);
    return { groups, prIds, totalVolume, prCount: prIds.size };
  }, [logs]);

  return (
    <View style={styles.flex}>
      <Text style={styles.title}>Progress</Text>

      <View style={styles.filters}>
        <Text style={styles.filterLabel}>Exercise type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Chip label="All" active={category === 'all'} onPress={() => setCategory('all')} />
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} active={category === c} accent={categoryColor[c]} onPress={() => setCategory(c)} />
          ))}
        </ScrollView>

        <Text style={styles.filterLabel}>Split day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Chip label="Any" active={splitDay === 'all'} onPress={() => setSplitDay('all')} />
          {SPLIT_DAYS.map((s) => (
            <Chip key={s} label={s} active={splitDay === s} accent={splitColor[s]} onPress={() => setSplitDay(s)} />
          ))}
        </ScrollView>

        <Text style={styles.filterLabel}>Date range</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {DATE_RANGES.map((r) => (
            <Chip key={r.key} label={r.label} active={range === r.key} accent={colors.accent} onPress={() => setRange(r.key)} />
          ))}
        </ScrollView>
      </View>

      <View style={styles.summary}>
        <View style={styles.sumItem}>
          <Text style={styles.sumNum}>{logs.length}</Text>
          <Text style={styles.sumLabel}>sessions</Text>
        </View>
        <View style={styles.sumDivider} />
        <View style={styles.sumItem}>
          <Text style={styles.sumNum}>{Math.round(totalVolume).toLocaleString()}</Text>
          <Text style={styles.sumLabel}>kg volume</Text>
        </View>
        <View style={styles.sumDivider} />
        <View style={styles.sumItem}>
          <Text style={[styles.sumNum, { color: colors.lime }]}>{prCount}</Text>
          <Text style={styles.sumLabel}>PRs</Text>
        </View>
      </View>

      <View style={styles.segment}>
        <Pressable onPress={() => setView('exercises')} style={[styles.segBtn, view === 'exercises' && styles.segActive]}>
          <Text style={[styles.segText, view === 'exercises' && styles.segTextActive]}>By exercise</Text>
        </Pressable>
        <Pressable onPress={() => setView('timeline')} style={[styles.segBtn, view === 'timeline' && styles.segActive]}>
          <Text style={[styles.segText, view === 'timeline' && styles.segTextActive]}>Timeline</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing(4) }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : logs.length === 0 ? (
        <Text style={styles.empty}>No workouts logged in this range yet.</Text>
      ) : view === 'exercises' ? (
        <ScrollView contentContainerStyle={styles.list}>
          {groups.map((g) => {
            const sm = statusMeta[g.status] || statusMeta.new;
            return (
              <Pressable
                key={g.key}
                style={styles.card}
                onPress={() => g.exerciseId && onOpenExerciseId(g.exerciseId)}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {g.name}
                    </Text>
                    <View style={{ flexDirection: 'row', marginTop: 6 }}>
                      {!!g.category && <Tag label={g.category} color={categoryColor[g.category] || colors.textDim} solid />}
                      <View style={{ width: 6 }} />
                      <View style={[styles.statusPill, { borderColor: sm.color }]}>
                        <Text style={[styles.statusText, { color: sm.color }]}>
                          {sm.icon} {sm.label}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <MiniBars series={g.series} />
                </View>
                <View style={styles.cardStats}>
                  <Text style={styles.cardStat}>
                    <Text style={styles.cardStatNum}>{g.sessions}</Text> sessions
                  </Text>
                  <Text style={styles.cardStat}>
                    Best e1RM <Text style={styles.cardStatNum}>{Math.round(g.best)}kg</Text>
                  </Text>
                  <Text style={styles.cardStat}>
                    Top <Text style={styles.cardStatNum}>{Math.max(...g.series)}kg</Text>
                  </Text>
                </View>
              </Pressable>
            );
          })}
          <View style={{ height: spacing(3) }} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {logs.map((l) => (
            <View key={l.id} style={styles.logCard}>
              <View style={styles.logRow}>
                {!!l.photo_url && <ProgressPhoto value={l.photo_url} style={styles.logThumb} />}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.logName} numberOfLines={1}>
                      {l.exercise_name}
                    </Text>
                    {prIds.has(l.id) && (
                      <View style={styles.prBadge}>
                        <Text style={styles.prText}>PR</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.logMeta}>
                    {prettyDate(l.performed_on)} · {l.sets.map((s) => `${s.reps}×${s.weight}`).join(', ')}
                  </Text>
                </View>
                <Text style={styles.logVol}>{Math.round(logVolume(l))}kg</Text>
              </View>
              {!!l.ai_summary && (
                <View style={styles.coachBox}>
                  <Text style={styles.coachLabel}>{COACH_NAME}</Text>
                  <Text style={styles.coachText}>{l.ai_summary}</Text>
                </View>
              )}
            </View>
          ))}
          <View style={{ height: spacing(3) }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', paddingHorizontal: spacing(2.5), paddingTop: spacing(1) },
  filters: { marginTop: spacing(1) },
  filterLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing(2.5),
    marginTop: spacing(1),
    marginBottom: 4,
  },
  filterRow: { paddingHorizontal: spacing(2.5) },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginHorizontal: spacing(2.5),
    marginTop: spacing(1.5),
    paddingVertical: spacing(1.5),
  },
  sumItem: { flex: 1, alignItems: 'center' },
  sumDivider: { width: 1, height: 30, backgroundColor: colors.border },
  sumNum: { color: colors.text, fontSize: 20, fontWeight: '900' },
  sumLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },
  segment: {
    flexDirection: 'row',
    marginHorizontal: spacing(2.5),
    marginTop: spacing(1.5),
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
  },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  segActive: { backgroundColor: colors.primary },
  segText: { color: colors.textDim, fontWeight: '800', fontSize: 14 },
  segTextActive: { color: colors.white },
  list: { padding: spacing(2.5), paddingTop: spacing(1.5) },
  error: { color: colors.danger, textAlign: 'center', marginTop: spacing(4), paddingHorizontal: spacing(3) },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: spacing(4) },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  cardName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  statusPill: { borderWidth: 1, borderRadius: radius.sm, paddingVertical: 2, paddingHorizontal: 8 },
  statusText: { fontSize: 11, fontWeight: '900' },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cardStat: { color: colors.textDim, fontSize: 12 },
  cardStatNum: { color: colors.text, fontWeight: '900' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 42, marginLeft: 10 },
  barTrack: { width: 6, height: '100%', justifyContent: 'flex-end', marginLeft: 3 },
  barFill: { width: '100%', backgroundColor: colors.accent, borderRadius: 2 },
  logCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  logRow: { flexDirection: 'row', alignItems: 'center' },
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
  logThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.cardAlt,
    marginRight: 12,
  },
  logName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  logMeta: { color: colors.textDim, fontSize: 13, marginTop: 3 },
  logVol: { color: colors.accent, fontSize: 14, fontWeight: '900', marginLeft: 8 },
  prBadge: { backgroundColor: colors.lime, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 8 },
  prText: { color: '#0B0E14', fontSize: 10, fontWeight: '900' },
});
