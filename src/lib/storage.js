import { supabase } from './supabase';

export const PHOTO_BUCKET = 'progress-photos';

// The bucket is private. A public bucket serves objects by URL regardless of the
// object RLS policies, so every progress photo was permanently readable by
// anyone holding the link — including after its workout log was deleted. Reads
// now go through short-lived signed URLs, which puts them back under the
// `<uid>/` policies that were already in place.
const SIGNED_TTL_S = 60 * 60;

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

// The Supabase JS client can't upload a React Native blob reliably, so we take
// the base64 the picker already gives us and hand up raw bytes instead. atob
// exists on Hermes (RN 0.74+) and in every browser, so this works on all targets.
function base64ToBytes(base64) {
  const binary = global.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The object path for a stored photo.
 *
 * `photo_url` used to hold a full public URL and now holds a bare object path,
 * so rows written before the bucket went private still have to resolve.
 * Anything else that looks like a URL points somewhere we don't serve.
 */
export function photoPath(value) {
  if (!value) return null;
  const marker = `/object/public/${PHOTO_BUCKET}/`;
  const idx = value.indexOf(marker);
  if (idx !== -1) return decodeURIComponent(value.slice(idx + marker.length));
  return value.startsWith('http') ? null : value;
}

// Signed links are reused until they are close to expiring, so scrolling the log
// list doesn't re-sign the same object on every render.
const signedCache = new Map();

export async function signedPhotoUrl(value) {
  const path = photoPath(value);
  if (!path) return null;

  const cached = signedCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, SIGNED_TTL_S);
  if (error || !data?.signedUrl) return null;

  // Retire the entry five minutes early so a link never expires mid-render.
  signedCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + (SIGNED_TTL_S - 300) * 1000 });
  return data.signedUrl;
}

/**
 * Upload one picked image asset and return its object path.
 *
 * Storage RLS only lets a user write inside a folder named after their uid, so
 * every path is `<uid>/<file>`. The bucket also caps size and content type, so a
 * tampered `mimeType` is refused by the server rather than trusted.
 */
export async function uploadProgressPhoto(asset) {
  if (!asset?.base64) throw new Error('Could not read that image.');

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const uid = userData?.user?.id;
  if (!uid) throw new Error('No session yet — reopen the app and try again.');

  const contentType = asset.mimeType || 'image/jpeg';
  const ext = EXT_BY_MIME[contentType] || asset.fileName?.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, base64ToBytes(asset.base64), { contentType, upsert: false });
  if (error) throw error;

  return path;
}

// Removes the stored object: when a photo is swapped or dropped before the log
// is saved, and when a log is deleted — otherwise the image outlives the row
// that pointed at it.
export async function deleteProgressPhoto(value) {
  const path = photoPath(value);
  if (!path) return;
  signedCache.delete(path);
  await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}
