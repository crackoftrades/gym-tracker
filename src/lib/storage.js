import { supabase } from './supabase';

export const PHOTO_BUCKET = 'progress-photos';

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
 * Upload one picked image asset and return its public URL.
 * Storage RLS only lets a user write inside a folder named after their uid,
 * so every path is `<uid>/<file>`.
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

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Best-effort cleanup when a photo is removed before the log is saved, so
// abandoned uploads don't pile up in the bucket.
export async function deleteProgressPhoto(publicUrl) {
  if (!publicUrl) return;
  const marker = `/object/public/${PHOTO_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(publicUrl.slice(idx + marker.length));
  await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}
