import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Chip from './Chip';
import ExerciseRow from './ExerciseRow';
import { listExercises } from '../lib/db';
import { CATEGORIES } from '../lib/constants';
import { categoryColor, colors, radius, spacing } from '../theme';

// Full-screen modal for choosing an exercise (e.g. to add to a plan day).
export default function ExercisePicker({ visible, title = 'Add exercise', onPick, onClose }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLoading(true);
    listExercises({ category, search })
      .then((d) => alive && setRows(d))
      .catch(() => alive && setRows([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [visible, category, search]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.flex}>
        <View style={styles.topbar}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.close}>Done</Text>
          </Pressable>
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search…"
          placeholderTextColor={colors.textFaint}
          style={styles.search}
          autoCorrect={false}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginTop: spacing(1) }} contentContainerStyle={{ paddingHorizontal: spacing(2.5) }}>
          <Chip label="All" active={category === 'all'} onPress={() => setCategory('all')} />
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} active={category === c} accent={categoryColor[c]} onPress={() => setCategory(c)} />
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing(4) }} />
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {rows.map((ex) => (
              <ExerciseRow
                key={ex.id}
                exercise={ex}
                onPress={() => onPick(ex)}
                right={<Text style={styles.plus}>＋</Text>}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing(5) },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing(2.5),
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  close: { color: colors.primary, fontSize: 16, fontWeight: '800' },
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
  list: { padding: spacing(2.5), paddingTop: spacing(1) },
  plus: { color: colors.primary, fontSize: 22, fontWeight: '900', marginLeft: 8 },
});
