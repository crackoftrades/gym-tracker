import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '../components/Button';
import Tag from '../components/Tag';
import { categoryColor, colors, radius, splitColor, spacing } from '../theme';

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ExerciseDetailScreen({ exercise: ex, onBack, onLog }) {
  const repRange =
    ex.rec_rep_low && ex.rec_rep_high ? `${ex.rec_rep_low}–${ex.rec_rep_high}` : ex.rec_rep_low || '—';
  const mistakes = Array.isArray(ex.mistakes) ? ex.mistakes : [];

  return (
    <View style={styles.flex}>
      <View style={styles.topbar}>
        <Text style={styles.back} onPress={onBack}>
          ‹ Back
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{ex.name}</Text>
        <View style={styles.tagRow}>
          <Tag label={ex.category} color={categoryColor[ex.category] || colors.textDim} solid />
          {!!ex.split_day && (
            <View style={{ marginLeft: 6 }}>
              <Tag label={ex.split_day} color={splitColor[ex.split_day] || colors.textDim} />
            </View>
          )}
          {!!ex.equipment && (
            <View style={{ marginLeft: 6 }}>
              <Tag label={ex.equipment} color={colors.textDim} />
            </View>
          )}
          {!!ex.difficulty && (
            <View style={{ marginLeft: 6 }}>
              <Tag label={ex.difficulty} color={colors.warn} />
            </View>
          )}
        </View>

        <View style={styles.statsRow}>
          <Stat label="Sets" value={ex.rec_sets || '—'} />
          <Stat label="Reps" value={repRange} />
          <Stat label="Rest" value={ex.rest_seconds ? `${ex.rest_seconds}s` : '—'} />
          <Stat label="Tempo" value={ex.tempo || '—'} />
        </View>

        {(ex.primary_muscles?.length > 0 || ex.secondary_muscles?.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Muscles worked</Text>
            <Text style={styles.body}>
              <Text style={styles.bodyStrong}>Primary: </Text>
              {(ex.primary_muscles || []).join(', ') || '—'}
            </Text>
            {ex.secondary_muscles?.length > 0 && (
              <Text style={[styles.body, { marginTop: 4 }]}>
                <Text style={styles.bodyStrong}>Secondary: </Text>
                {ex.secondary_muscles.join(', ')}
              </Text>
            )}
          </View>
        )}

        {ex.steps?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How to do it</Text>
            {ex.steps.map((s, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{s}</Text>
              </View>
            ))}
          </View>
        )}

        {ex.cues?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Coaching cues</Text>
            {ex.cues.map((c, i) => (
              <View key={i} style={styles.bullet}>
                <Text style={styles.bulletDot}>✓</Text>
                <Text style={styles.stepText}>{c}</Text>
              </View>
            ))}
          </View>
        )}

        {mistakes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Common mistakes → how to fix</Text>
            {mistakes.map((m, i) => (
              <View key={i} style={styles.mistakeCard}>
                <View style={styles.mistakeHead}>
                  <Text style={styles.xMark}>✕</Text>
                  <Text style={styles.mistakeText}>{m.mistake}</Text>
                </View>
                <View style={styles.fixHead}>
                  <Text style={styles.checkMark}>✓</Text>
                  <Text style={styles.fixText}>{m.fix}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: spacing(2) }} />
      </ScrollView>

      <View style={styles.footer}>
        <Button title="＋ Log this exercise" onPress={() => onLog?.(ex)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topbar: { paddingHorizontal: spacing(2), paddingTop: spacing(1), paddingBottom: spacing(0.5) },
  back: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  scroll: { padding: spacing(2.5), paddingTop: spacing(1) },
  title: { color: colors.text, fontSize: 26, fontWeight: '900' },
  tagRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing(1), flexWrap: 'wrap' },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing(2),
    paddingVertical: spacing(1.5),
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.accent, fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },
  section: { marginTop: spacing(3) },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: spacing(1.5),
    letterSpacing: 0.3,
  },
  body: { color: colors.textDim, fontSize: 15, lineHeight: 22 },
  bodyStrong: { color: colors.text, fontWeight: '800' },
  stepRow: { flexDirection: 'row', marginBottom: spacing(1.5), alignItems: 'flex-start' },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary + '22',
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  stepNumText: { color: colors.primary, fontWeight: '900', fontSize: 13 },
  stepText: { color: colors.text, fontSize: 15, lineHeight: 22, flex: 1 },
  bullet: { flexDirection: 'row', marginBottom: spacing(1), alignItems: 'flex-start' },
  bulletDot: { color: colors.accent, fontWeight: '900', fontSize: 15, marginRight: 12, marginTop: 1 },
  mistakeCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: spacing(1.5),
  },
  mistakeHead: { flexDirection: 'row', alignItems: 'flex-start' },
  xMark: { color: colors.danger, fontWeight: '900', fontSize: 15, marginRight: 10, marginTop: 1 },
  mistakeText: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1, lineHeight: 21 },
  fixHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  checkMark: { color: colors.accent, fontWeight: '900', fontSize: 15, marginRight: 10, marginTop: 1 },
  fixText: { color: colors.textDim, fontSize: 15, flex: 1, lineHeight: 21 },
  footer: {
    padding: spacing(2),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgAlt,
  },
});
