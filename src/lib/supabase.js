import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
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
    // Email confirmation links come back with the tokens in the URL fragment,
    // so the web build has to read them. Native has no URL to parse.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
