-- Snapshot of the three seeded demo workouts removed on 2026-07-30, taken
-- immediately before `delete from public.workout_logs where user_id is null`.
--
-- They were unreadable by then: the SELECT policy had already been tightened to
-- `user_id = auth.uid()`, and `user_id` was about to become NOT NULL.
--
-- To restore, give each row a real owner first — these inserts set user_id to
-- null and will now fail the NOT NULL constraint. Replace `null` in the second
-- value with the owning account's uuid.

insert into public.workout_logs (id, user_id, exercise_id, exercise_name, category, split_day, performed_on, sets, notes, photo_url, ai_summary) values ('fed75f37-ffe8-4c7d-abd7-b5dfc22264e5'::uuid, null, '9660637d-d52f-499e-8e06-6e5827fab6a3'::uuid, 'Back Squat', 'Legs', 'Legs', '2026-07-27'::date, '[{"reps": 8, "weight": 80}, {"reps": 8, "weight": 80}, {"reps": 8, "weight": 80}]'::jsonb, 'Sample workout — visible to every demo visitor.', null, null);

insert into public.workout_logs (id, user_id, exercise_id, exercise_name, category, split_day, performed_on, sets, notes, photo_url, ai_summary) values ('1aa7a68b-76be-48b4-a528-a876b6c285b4'::uuid, null, 'c675b175-32b0-4f58-9e88-8a6a36e53be3'::uuid, 'Barbell Bench Press', 'Chest', 'Push', '2026-07-27'::date, '[{"reps": 10, "weight": 60}, {"reps": 10, "weight": 60}, {"reps": 10, "weight": 60}, {"reps": 10, "weight": 60}]'::jsonb, 'Sample workout — visible to every demo visitor.', null, null);

insert into public.workout_logs (id, user_id, exercise_id, exercise_name, category, split_day, performed_on, sets, notes, photo_url, ai_summary) values ('91f36edc-d217-4233-a31f-fc4804f3ae1c'::uuid, null, 'e50314e0-0eb7-4dec-97f1-d8ab39413790'::uuid, 'Conventional Deadlift', 'Back', 'Pull', '2026-07-27'::date, '[{"reps": 5, "weight": 100}, {"reps": 5, "weight": 100}, {"reps": 5, "weight": 100}]'::jsonb, 'Sample workout — visible to every demo visitor.', null, null);
