-- Security hardening, 2026-08-06.
--
-- 1. Table privileges on the four original tables.
--
-- Supabase grants ALL on new tables to `anon` and `authenticated`, which
-- includes TRUNCATE — and TRUNCATE bypasses RLS entirely. The courses/bookings
-- migration already revoked this and said why; these four tables predate it and
-- never got the same treatment.
--
-- `anon` is dropped from these tables completely: none of them carries an
-- `anon` policy, so the role could never read a row anyway, and the app gates
-- every screen behind a session.

revoke all on public.exercises, public.plan_days, public.plan_exercises, public.workout_logs
  from anon, authenticated;

grant select, insert, update, delete
  on public.exercises, public.plan_days, public.plan_exercises, public.workout_logs
  to authenticated;

-- 2. The progress-photos bucket.
--
-- It was public, unlimited in size, and accepted any content type:
--   * a public bucket serves objects by URL regardless of the object RLS
--     policies, so every progress photo was permanently readable by anyone
--     holding the link, and stayed readable after its workout log was deleted;
--   * with no size limit, one account could upload arbitrarily large files;
--   * with no MIME allow-list and a client-supplied content type, an account
--     could host arbitrary HTML on the project's own supabase.co origin.
--
-- Private + signed URLs puts reads back under the object policies, which are
-- already correctly scoped to `<uid>/`. `image/jpg` is not a real MIME type but
-- the client maps it, so it is accepted rather than silently rejected.
--
-- `src/lib/storage.js` reads and writes object paths to match; it still
-- resolves the full public URLs written before this migration.

update storage.buckets
set public = false,
    file_size_limit = 5242880,  -- 5 MB
    allowed_mime_types = array[
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
    ]
where id = 'progress-photos';
