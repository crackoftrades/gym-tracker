import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Button from '../components/Button';
import { authErrorMessage, signInAsGuest, signInWithEmail, signUpWithEmail } from '../lib/auth';
import { colors, radius, spacing } from '../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

// Sent after a sign-up that Supabase left pending on email confirmation.
function CheckInbox({ email, onBack }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sentEmoji}>📬</Text>
      <Text style={styles.title}>Confirm your email</Text>
      <Text style={styles.body}>
        We sent a confirmation link to <Text style={styles.bodyStrong}>{email}</Text>. Click it, then come
        back and sign in.
      </Text>
      <Text style={styles.hint}>No email after a minute? Check your spam folder.</Text>
      <Button title="Back to sign in" variant="ghost" onPress={onBack} style={{ marginTop: spacing(2.5) }} />
    </View>
  );
}

export default function AuthScreen() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const passwordRef = useRef(null);

  const isSignup = mode === 'signup';

  // Editing is an attempt to fix the problem — stop showing the old complaint.
  const edit = (setter) => (value) => {
    setter(value);
    if (error) setError('');
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
  };

  // A session landing in AsyncStorage fires onAuthStateChange in App.js, which
  // swaps this screen out — nothing to do here on success.
  const submit = async () => {
    const mail = email.trim();
    if (!EMAIL_RE.test(mail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setError('');
    setBusy(true);
    try {
      if (isSignup) {
        const { needsConfirmation } = await signUpWithEmail(mail, password);
        if (needsConfirmation) {
          setSentTo(mail);
          setPassword('');
        }
      } else {
        await signInWithEmail(mail, password);
      }
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const continueAsGuest = async () => {
    setError('');
    setGuestBusy(true);
    try {
      await signInAsGuest();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setGuestBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>🏋️</Text>
        <Text style={styles.brand}>Gym Tracker</Text>
        <Text style={styles.tagline}>Log every set. Watch the numbers move.</Text>

        {sentTo ? (
          <CheckInbox
            email={sentTo}
            onBack={() => {
              setSentTo('');
              setMode('signin');
            }}
          />
        ) : (
          <View style={styles.card}>
            <View style={styles.segment}>
              <Pressable
                onPress={() => switchMode('signin')}
                style={[styles.segBtn, !isSignup && styles.segActive]}
              >
                <Text style={[styles.segText, !isSignup && styles.segTextActive]}>Sign in</Text>
              </Pressable>
              <Pressable
                onPress={() => switchMode('signup')}
                style={[styles.segBtn, isSignup && styles.segActive]}
              >
                <Text style={[styles.segText, isSignup && styles.segTextActive]}>Sign up</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={edit(setEmail)}
              placeholder="you@example.com"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              inputMode="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={edit(setPassword)}
              placeholder={isSignup ? `At least ${MIN_PASSWORD} characters` : '••••••••'}
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textContentType={isSignup ? 'newPassword' : 'password'}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              onSubmitEditing={submit}
              returnKeyType="go"
            />

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Button
              title={isSignup ? 'Create account' : 'Sign in'}
              onPress={submit}
              loading={busy}
              disabled={guestBusy}
              style={{ marginTop: spacing(2.5) }}
            />

            <View style={styles.divider}>
              <View style={styles.rule} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.rule} />
            </View>

            <Button
              title="Continue as guest"
              variant="ghost"
              onPress={continueAsGuest}
              loading={guestBusy}
              disabled={busy}
            />
            <Text style={styles.guestNote}>
              Guest data lives on this device only and can't be recovered if you clear it.
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing(3),
    paddingBottom: spacing(6),
  },
  logo: { fontSize: 44, textAlign: 'center' },
  brand: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: spacing(1),
  },
  tagline: {
    color: colors.textDim,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: spacing(3),
  },
  card: {
    backgroundColor: colors.bgAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2.5),
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: spacing(2),
  },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  segActive: { backgroundColor: colors.primary },
  segText: { color: colors.textDim, fontWeight: '800', fontSize: 14 },
  segTextActive: { color: colors.white },
  label: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing(1),
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 13,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 15,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
    marginTop: spacing(1.5),
    lineHeight: 18,
  },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing(2) },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: '700',
    marginHorizontal: 12,
    textTransform: 'uppercase',
  },
  guestNote: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: spacing(1.5),
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '900', textAlign: 'center', marginTop: spacing(1) },
  body: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: spacing(1),
  },
  bodyStrong: { color: colors.text, fontWeight: '800' },
  hint: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: spacing(1.5) },
  sentEmoji: { fontSize: 40, textAlign: 'center' },
});
