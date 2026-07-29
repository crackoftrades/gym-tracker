import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Button from './Button';
import PhotoField from './PhotoField';
import { lastLogFor, logWorkout } from '../lib/db';
import { deleteProgressPhoto } from '../lib/storage';
import { isoDate, prettyDate } from '../lib/metrics';
import { colors, radius, spacing } from '../theme';

const blankSet = { reps: '', weight: '' };

// Bottom sheet for logging sets (reps x weight) for one exercise.
export default function LogSheet({ visible, exercise, onClose, onSaved }) {
  const [sets, setSets] = useState([{ ...blankSet }]);
  const [notes, setNotes] = useState('');
  const [performedOn, setPerformedOn] = useState(isoDate());
  const [photoUrl, setPhotoUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastHint, setLastHint] = useState('');

  useEffect(() => {
    if (!visible || !exercise) return;
    setNotes('');
    setError('');
    setPhotoUrl(null);
    setPerformedOn(isoDate());
    // Prefill from the most recent session so you just tap "save" or bump the weight.
    lastLogFor(exercise.id)
      .then((last) => {
        if (last?.sets?.length) {
          setSets(last.sets.map((s) => ({ reps: String(s.reps ?? ''), weight: String(s.weight ?? '') })));
          setLastHint(`Prefilled from ${prettyDate(last.performed_on)}`);
        } else {
          const n = exercise.rec_sets || 3;
          setSets(Array.from({ length: n }, () => ({ ...blankSet })));
          setLastHint('');
        }
      })
      .catch(() => {
        setSets([{ ...blankSet }]);
        setLastHint('');
      });
  }, [visible, exercise]);

  const updateSet = (i, key, val) => {
    setSets((prev) => prev.map((s, idx) => (idx === i ? { ...s, [key]: val.replace(/[^0-9.]/g, '') } : s)));
  };
  const addSet = () => {
    setSets((prev) => {
      const last = prev[prev.length - 1] || blankSet;
      return [...prev, { ...last }];
    });
  };
  const removeSet = (i) => setSets((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  // Photos upload on pick, so bailing out would otherwise orphan the file.
  const cancel = () => {
    if (busy) return;
    deleteProgressPhoto(photoUrl).catch(() => {});
    setPhotoUrl(null);
    onClose?.();
  };

  const save = async () => {
    setError('');
    const clean = sets
      .map((s) => ({ reps: Number(s.reps), weight: Number(s.weight) }))
      .filter((s) => s.reps > 0);
    if (clean.length === 0) {
      setError('Add at least one set with a rep count.');
      return;
    }
    setBusy(true);
    try {
      const log = await logWorkout({ exercise, sets: clean, notes, performedOn, photoUrl });
      setPhotoUrl(null);
      // The saved row is handed up so the coach summary can be fetched for it.
      onSaved?.(log);
      onClose?.();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  if (!exercise) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={cancel}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={cancel} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title} numberOfLines={1}>
              Log · {exercise.name}
            </Text>
            {!!lastHint && <Text style={styles.hint}>{lastHint}</Text>}

            <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
              <View style={styles.headerRow}>
                <Text style={[styles.colHead, { width: 34 }]}>Set</Text>
                <Text style={[styles.colHead, { flex: 1 }]}>Reps</Text>
                <Text style={[styles.colHead, { flex: 1 }]}>Weight (kg)</Text>
                <View style={{ width: 34 }} />
              </View>

              {sets.map((s, i) => (
                <View key={i} style={styles.setRow}>
                  <Text style={styles.setNum}>{i + 1}</Text>
                  <TextInput
                    value={s.reps}
                    onChangeText={(v) => updateSet(i, 'reps', v)}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textFaint}
                    style={styles.cell}
                  />
                  <TextInput
                    value={s.weight}
                    onChangeText={(v) => updateSet(i, 'weight', v)}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textFaint}
                    style={styles.cell}
                  />
                  <Pressable onPress={() => removeSet(i)} style={styles.removeBtn}>
                    <Text style={styles.removeText}>✕</Text>
                  </Pressable>
                </View>
              ))}

              <Pressable onPress={addSet} style={styles.addRow}>
                <Text style={styles.addText}>+ Add set</Text>
              </Pressable>

              <Text style={styles.label}>Date</Text>
              <TextInput
                value={performedOn}
                onChangeText={setPerformedOn}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textFaint}
                style={styles.notes}
              />
              <Text style={styles.label}>Notes (optional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Felt strong, last set was a grind…"
                placeholderTextColor={colors.textFaint}
                style={[styles.notes, { height: 60 }]}
                multiline
              />

              <PhotoField value={photoUrl} onChange={setPhotoUrl} onError={setError} />
            </ScrollView>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <Button title="Cancel" variant="ghost" onPress={cancel} style={{ flex: 1 }} />
              <View style={{ width: 12 }} />
              <Button title="Save workout" onPress={save} loading={busy} style={{ flex: 1.4 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  backdropTap: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.bgAlt,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2.5),
    paddingBottom: spacing(4),
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.borderLight,
    alignSelf: 'center',
    marginBottom: spacing(1.5),
  },
  title: { color: colors.text, fontSize: 19, fontWeight: '900' },
  hint: { color: colors.accent, fontSize: 12, marginTop: 3, fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing(1.5), marginBottom: 6 },
  colHead: { color: colors.textDim, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  setNum: {
    width: 34,
    color: colors.textDim,
    fontWeight: '800',
    fontSize: 15,
  },
  cell: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
    textAlign: 'center',
  },
  removeBtn: { width: 34, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.textFaint, fontSize: 16 },
  addRow: { paddingVertical: 10, alignItems: 'center' },
  addText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  label: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: spacing(1),
    marginBottom: 6,
  },
  notes: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    color: colors.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing(1), fontWeight: '600' },
  actions: { flexDirection: 'row', marginTop: spacing(2) },
});
