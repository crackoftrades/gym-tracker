import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Chip from '../components/Chip';
import ExerciseRow from '../components/ExerciseRow';
import { listExercises } from '../lib/db';
import { CATEGORIES, EQUIPMENT, SPLIT_DAYS } from '../lib/constants';
import { categoryColor, colors, radius, splitColor, spacing } from '../theme';

export default function LibraryScreen({ onOpenExercise }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [splitDay, setSplitDay] = useState('all');
  const [equipment, setEquipment] = useState('all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listExercises({ category, splitDay, equipment, search })
      .then((data) => alive && (setRows(data), setError('')))
      .catch((e) => alive && setError(String(e?.message || e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [category, splitDay, equipment, search]);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Exercises</Text>
        <Text style={styles.count}>{rows.length}</Text>
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search exercises…"
        placeholderTextColor={colors.textFaint}
        style={styles.search}
        autoCorrect={false}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        <Chip label="All types" active={category === 'all'} onPress={() => setCategory('all')} />
        {CATEGORIES.map((c) => (
          <Chip key={c} label={c} active={category === c} accent={categoryColor[c]} onPress={() => setCategory(c)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        <Chip label="Any day" active={splitDay === 'all'} onPress={() => setSplitDay('all')} />
        {SPLIT_DAYS.map((s) => (
          <Chip key={s} label={s} active={splitDay === s} accent={splitColor[s]} onPress={() => setSplitDay(s)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        <Chip label="Any gear" active={equipment === 'all'} onPress={() => setEquipment('all')} />
        {EQUIPMENT.map((e) => (
          <Chip key={e} label={e} active={equipment === e} onPress={() => setEquipment(e)} />
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing(4) }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>No exercises match these filters.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {rows.map((ex) => (
            <ExerciseRow key={ex.id} exercise={ex} onPress={() => onOpenExercise(ex)} />
          ))}
        </ScrollView>
      )}
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
  count: { color: colors.textDim, fontSize: 16, fontWeight: '800' },
  search: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginHorizontal: spacing(2.5),
    marginTop: spacing(1.5),
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.text,
    fontSize: 15,
  },
  filterScroll: { flexGrow: 0, marginTop: spacing(1) },
  filterRow: { paddingHorizontal: spacing(2.5) },
  list: { padding: spacing(2.5), paddingTop: spacing(1) },
  error: { color: colors.danger, textAlign: 'center', marginTop: spacing(4), paddingHorizontal: spacing(3) },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: spacing(4) },
});
