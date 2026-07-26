import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  // Surfaced early so a missing .env is obvious rather than a cryptic network error.
  console.warn('Supabase env vars missing. Check your .env (EXPO_PUBLIC_SUPABASE_URL / _KEY).');
}

export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Demo stage: there is no login screen. Every table's RLS policy and user_id
// foreign key still needs a real auth.users session, so we mint an anonymous
// one on first launch and reuse it from AsyncStorage forever after. Each
// device therefore gets its own private plan and logs, with RLS unchanged.
export async function ensureDemoSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session) return data.session;

  const { data: fresh, error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) throw signInError;
  return fresh.session;
}
