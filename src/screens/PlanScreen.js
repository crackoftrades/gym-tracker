import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Button from '../components/Button';
import Chip from '../components/Chip';
import Tag from '../components/Tag';
import ExercisePicker from '../components/ExercisePicker';
import { addPlanExercise, createPlanDay, deletePlanDay, listPlan, removePlanExercise } from '../lib/db';
import { SPLIT_DAYS } from '../lib/constants';
import { colors, radius, splitColor, spacing } from '../theme';

export default function PlanScreen({ onOpenExercise }) {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSplit, setNewSplit] = useState('Push');
  const [pickerFor, setPickerFor] = useState(null); // plan day id

  const refresh = () => {
    setLoading(true);
    listPlan()
      .then((d) => (setDays(d), setError('')))
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const createDay = async () => {
    if (!newName.trim()) return;
    try {
      await createPlanDay({ name: newName.trim(), splitDay: newSplit, dayIndex: days.length });
      setNewName('');
      setAdding(false);
      refresh();
    } catch (e) {
      setError(String(e?.message || e));
    }
  };

  const pickExercise = async (ex) => {
    const day = days.find((d) => d.id === pickerFor);
    try {
      await addPlanExercise({ planDayId: pickerFor, exercise: ex, orderIndex: day?.items?.length || 0 });
      setPickerFor(null);
      refresh();
    } catch (e) {
      setError(String(e?.message || e));
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Weekly Plan</Text>
        {!adding && <Button title="＋ Day" onPress={() => setAdding(true)} style={{ paddingVertical: 8 }} />}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing(4) }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {!!error && <Text style={styles.error}>{error}</Text>}

          {adding && (
            <View style={styles.newCard}>
              <Text style={styles.newTitle}>New training day</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Push A, Leg Day"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
              />
              <View style={styles.chipWrap}>
                {SPLIT_DAYS.map((s) => (
                  <Chip key={s} label={s} active={newSplit === s} accent={splitColor[s]} onPress={() => setNewSplit(s)} />
                ))}
              </View>
              <View style={styles.rowBtns}>
                <Button title="Cancel" variant="ghost" onPress={() => setAdding(false)} style={{ flex: 1 }} />
                <View style={{ width: 12 }} />
                <Button title="Create" onPress={createDay} style={{ flex: 1 }} />
              </View>
            </View>
          )}

          {days.length === 0 && !adding && (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🗓️</Text>
              <Text style={styles.emptyTitle}>No plan yet</Text>
              <Text style={styles.emptyText}>
                Add training days (Push, Pull, Legs…) and stack exercises onto each. Your plan is saved and
                remembered across sessions.
              </Text>
            </View>
          )}

          {days.map((day) => (
            <View key={day.id} style={styles.dayCard}>
              <View style={styles.dayHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dayName}>{day.name}</Text>
                  {!!day.split_day && (
                    <View style={{ marginTop: 6, flexDirection: 'row' }}>
                      <Tag label={day.split_day} color={splitColor[day.split_day] || colors.textDim} solid />
                    </View>
                  )}
                </View>
                <Pressable onPress={() => deletePlanDay(day.id).then(refresh)} hitSlop={8}>
                  <Text style={styles.delDay}>Delete</Text>
                </Pressable>
              </View>

              {(day.items || []).map((it) => (
                <View key={it.id} style={styles.item}>
                  <Pressable style={{ flex: 1 }} onPress={() => it.exercise && onOpenExercise(it.exercise)}>
                    <Text style={styles.itemName}>{it.exercise?.name || 'Exercise'}</Text>
                    <Text style={styles.itemMeta}>
                      {it.target_sets} sets × {it.target_rep_low}–{it.target_rep_high} reps
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => removePlanExercise(it.id).then(refresh)} hitSlop={8}>
                    <Text style={styles.removeItem}>✕</Text>
                  </Pressable>
                </View>
              ))}

              <Pressable onPress={() => setPickerFor(day.id)} style={styles.addExercise}>
                <Text style={styles.addExerciseText}>＋ Add exercise</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      <ExercisePicker
        visible={!!pickerFor}
        title="Add to day"
        onPick={pickExercise}
        onClose={() => setPickerFor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing(2.5),
    paddingTop: spacing(1),
  },
  title: { color: colors.text, fontSize: 26, fontWeight: '900' },
  scroll: { padding: spacing(2.5), paddingTop: spacing(1.5) },
  error: { color: colors.danger, marginBottom: spacing(1.5) },
  newCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    padding: spacing(2),
    marginBottom: spacing(2),
  },
  newTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: spacing(1.5) },
  input: {
    backgroundColor: colors.bgAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.text,
    fontSize: 15,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing(1.5) },
  rowBtns: { flexDirection: 'row', marginTop: spacing(1) },
  empty: { alignItems: 'center', paddingVertical: spacing(5), paddingHorizontal: spacing(2) },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: spacing(1) },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginTop: spacing(1), lineHeight: 21 },
  dayCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2),
    marginBottom: spacing(2),
  },
  dayHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing(1.5) },
  dayName: { color: colors.text, fontSize: 19, fontWeight: '900' },
  delDay: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  itemName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  itemMeta: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  removeItem: { color: colors.textFaint, fontSize: 16, paddingHorizontal: 6 },
  addExercise: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addExerciseText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
});
