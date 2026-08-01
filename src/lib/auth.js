import { Platform } from 'react-native';
import { supabase } from './supabase';

// Where Supabase sends people after they click the confirmation link. Only
// meaningful on web — a native build would need its own URL scheme registered
// under Authentication → URL Configuration.
//
// The trailing slash matters. Redirect URLs are allow-listed as glob patterns
// and the conventional entry is `http://host:port/**`, which requires a path
// segment — a bare origin does not match it. Supabase silently falls back to
// the Site URL when a redirect isn't allow-listed, so without the slash a
// local sign-up confirmation bounces to production instead of the dev server.
function redirectTo() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  return window.location.origin + '/';
}

// Supabase's raw messages are terse and sometimes leak internals. Map the ones
// a user can actually act on; pass anything else through unchanged.
export function authErrorMessage(e) {
  const raw = String(e?.message || e || 'Something went wrong.');
  if (/invalid login credentials/i.test(raw)) return 'That email and password combination is wrong.';
  if (/email not confirmed/i.test(raw)) return 'Confirm your email first — check your inbox for the link.';
  if (/user already registered|already been registered/i.test(raw)) {
    return 'That email already has an account. Try signing in instead.';
  }
  if (/password should be at least/i.test(raw)) return 'Password must be at least 6 characters.';
  if (/unable to validate email|invalid format/i.test(raw)) return 'That email address does not look right.';
  if (/anonymous/i.test(raw)) {
    return 'Guest mode is disabled for this Supabase project. Enable anonymous sign-ins, or create an account.';
  }
  // Distinct from a per-user throttle: Supabase's built-in SMTP is capped at a
  // couple of emails per hour for the whole project, so one person signing up
  // can block the next one. Only a custom SMTP provider raises this ceiling.
  if (/email rate limit/i.test(raw) || e?.code === 'over_email_send_rate_limit') {
    return "The confirmation-email quota for this app is used up. Try again in an hour, or continue as guest.";
  }
  if (/rate limit|too many requests|after \d+ seconds/i.test(raw)) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  return raw;
}

export async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: redirectTo() },
  });
  if (error) throw error;

  // With "Confirm email" enabled there is no session yet — the account exists
  // but stays unusable until the emailed link is clicked. With it disabled,
  // signUp signs you straight in and `session` is populated.
  return { session: data.session, needsConfirmation: !data.session };
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data.session;
}

// Guest mode: the original demo behaviour. Data is owned by a throwaway
// anonymous user and RLS keeps it private to this device.
export async function signInAsGuest() {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function isGuest(session) {
  return !!session?.user?.is_anonymous;
}

export function accountLabel(session) {
  if (!session?.user) return '';
  return isGuest(session) ? 'Guest' : session.user.email || 'Account';
}
