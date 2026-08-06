import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import ProgressPhoto from './ProgressPhoto';
import { deleteProgressPhoto, uploadProgressPhoto } from '../lib/storage';
import { colors, radius, spacing } from '../theme';

// Pick one progress photo, upload it immediately, and hand the stored object
// path up. Uploading on pick (rather than on save) keeps the save path fast and
// lets the user see the thumbnail before committing the log.
export default function PhotoField({ value, onChange, onError }) {
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    onError?.('');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      onError?.('Photo library access is needed to attach a photo.');
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    });
    if (res.canceled || !res.assets?.length) return;

    setBusy(true);
    try {
      const previous = value;
      const path = await uploadProgressPhoto(res.assets[0]);
      onChange?.(path);
      deleteProgressPhoto(previous).catch(() => {});
    } catch (e) {
      onError?.(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    const previous = value;
    onChange?.(null);
    deleteProgressPhoto(previous).catch(() => {});
  };

  return (
    <View>
      <Text style={styles.label}>Progress photo (optional)</Text>

      {value ? (
        <View style={styles.preview}>
          <ProgressPhoto value={value} style={styles.thumb} />
          <View style={styles.previewBody}>
            <Text style={styles.previewText} numberOfLines={1}>
              Photo attached
            </Text>
            <View style={styles.previewActions}>
              <Pressable onPress={pick} disabled={busy} hitSlop={8}>
                <Text style={styles.replaceText}>Replace</Text>
              </Pressable>
              <Pressable onPress={remove} disabled={busy} hitSlop={8}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          </View>
          {busy && (
            <View style={styles.previewBusy}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
        </View>
      ) : (
        <Pressable
          onPress={pick}
          disabled={busy}
          style={({ pressed }) => [styles.dropzone, pressed && { opacity: 0.8 }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Text style={styles.dropIcon}>📷</Text>
              <Text style={styles.dropText}>Add a photo</Text>
              <Text style={styles.dropHint}>Uploads to your gym-tracker storage</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: spacing(1),
    marginBottom: 6,
  },
  dropzone: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.sm,
    paddingVertical: spacing(2),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 88,
  },
  dropIcon: { fontSize: 20 },
  dropText: { color: colors.primary, fontWeight: '800', fontSize: 14, marginTop: 4 },
  dropHint: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 10,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.cardAlt },
  previewBody: { flex: 1, marginLeft: 12 },
  previewText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  previewActions: { flexDirection: 'row', marginTop: 6 },
  replaceText: { color: colors.primary, fontWeight: '800', fontSize: 13, marginRight: 16 },
  removeText: { color: colors.danger, fontWeight: '800', fontSize: 13 },
  previewBusy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,14,20,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
});
