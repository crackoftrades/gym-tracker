import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Button from '../components/Button';
import { supabase } from '../lib/supabase';
import { colors, radius, spacing } from '../theme';

export default function AuthScreen() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isSignup = mode === 'signup';

  const submit = async () => {
    setError('');
    setNotice('');
    if (!email.trim() || password.length < 6) {
      setError('Enter an email and a password of at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        // If email confirmation is on, there is no session yet.
        if (!data.session) {
          setNotice('Account created. If asked, confirm via the email we sent, then sign in.');
          setMode('signin');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>🏋️</Text>
        <Text style={styles.title}>Gym Tracker</Text>
        <Text style={styles.subtitle}>Log every set. Watch the numbers climb.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="At least 6 characters"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            onSubmitEditing={submit}
          />

          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!notice && <Text style={styles.notice}>{notice}</Text>}

          <Button
            title={isSignup ? 'Create account' : 'Sign in'}
            onPress={submit}
            loading={busy}
            style={{ marginTop: spacing(1.5) }}
          />

          <TouchableOpacity
            onPress={() => {
              setMode(isSignup ? 'signin' : 'signup');
              setError('');
              setNotice('');
            }}
            style={styles.switch}
          >
            <Text style={styles.switchText}>
              {isSignup ? 'Have an account? ' : 'New here? '}
              <Text style={styles.switchLink}>{isSignup ? 'Sign in' : 'Create one'}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing(3) },
  logo: { fontSize: 52, textAlign: 'center' },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: spacing(1),
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing(0.5),
    marginBottom: spacing(3),
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2.5),
  },
  label: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: spacing(1),
  },
  input: {
    backgroundColor: colors.bgAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing(1.5), fontWeight: '600' },
  notice: { color: colors.accent, fontSize: 13, marginTop: spacing(1.5), fontWeight: '600' },
  switch: { marginTop: spacing(2), alignItems: 'center' },
  switchText: { color: colors.textDim, fontSize: 14 },
  switchLink: { color: colors.primary, fontWeight: '800' },
});
