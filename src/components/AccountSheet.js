import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Button from './Button';
import { authErrorMessage, isGuest, signOut } from '../lib/auth';
import { colors, radius, spacing } from '../theme';

// Tapping the account chip in the top bar opens this: who you are, and the way out.
export default function AccountSheet({ visible, session, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const guest = isGuest(session);

  const logOut = async () => {
    setError('');
    setBusy(true);
    try {
      await signOut();
      onClose?.();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Account</Text>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Signed in as</Text>
            <Text style={styles.rowValue} numberOfLines={1}>
              {guest ? 'Guest' : session?.user?.email}
            </Text>
          </View>

          {guest && (
            <Text style={styles.note}>
              You're training as a guest. This plan and these logs live on this device only — sign out
              and create an account to keep your own private history on any device.
            </Text>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Button
            title={guest ? 'Leave guest mode' : 'Log out'}
            variant="danger"
            onPress={logOut}
            loading={busy}
            style={{ marginTop: spacing(2.5) }}
          />
          <Button
            title="Close"
            variant="ghost"
            onPress={onClose}
            disabled={busy}
            style={{ marginTop: spacing(1) }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
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
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: spacing(2),
  },
  rowLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  rowValue: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 4 },
  note: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: spacing(1.5) },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', marginTop: spacing(1.5) },
});
