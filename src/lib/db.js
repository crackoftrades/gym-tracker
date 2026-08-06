import { deleteProgressPhoto } from './storage';
import { supabase } from './supabase';

async function uid() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

// ---------- Exercise library ----------
export async function listExercises({ category, splitDay, equipment, search } = {}) {
  let q = supabase.from('exercises').select('*').order('name');
  if (category && category !== 'all') q = q.eq('category', category);
  if (splitDay && splitDay !== 'all') q = q.eq('split_day', splitDay);
  if (equipment && equipment !== 'all') q = q.eq('equipment', equipment);
  if (search && search.trim()) q = q.ilike('name', `%${search.trim()}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getExercise(id) {
  const { data, error } = await supabase.from('exercises').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// ---------- Weekly plan ----------
export async function listPlan() {
  const { data, error } = await supabase
    .from('plan_days')
    .select('*, items:plan_exercises(*, exercise:exercises(*))')
    .order('day_index');
  if (error) throw error;
  return (data ?? []).map((d) => ({
    ...d,
    items: (d.items ?? []).sort((a, b) => a.order_index - b.order_index),
  }));
}

export async function createPlanDay({ name, splitDay, dayIndex }) {
  const user_id = await uid();
  const { data, error } = await supabase
    .from('plan_days')
    .insert({ user_id, name, split_day: splitDay, day_index: dayIndex })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePlanDay(id) {
  const { error } = await supabase.from('plan_days').delete().eq('id', id);
  if (error) throw error;
}

export async function addPlanExercise({ planDayId, exercise, orderIndex, sets, repLow, repHigh }) {
  const user_id = await uid();
  const { data, error } = await supabase
    .from('plan_exercises')
    .insert({
      user_id,
      plan_day_id: planDayId,
      exercise_id: exercise.id,
      order_index: orderIndex ?? 0,
      target_sets: sets ?? exercise.rec_sets ?? 3,
      target_rep_low: repLow ?? exercise.rec_rep_low ?? 8,
      target_rep_high: repHigh ?? exercise.rec_rep_high ?? 12,
    })
    .select('*, exercise:exercises(*)')
    .single();
  if (error) throw error;
  return data;
}

export async function removePlanExercise(id) {
  const { error } = await supabase.from('plan_exercises').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Workout logs ----------
export async function logWorkout({ exercise, sets, notes, performedOn, photoUrl }) {
  const user_id = await uid();
  const row = {
    user_id,
    exercise_id: exercise.id,
    exercise_name: exercise.name,
    category: exercise.category,
    split_day: exercise.split_day,
    sets,
    notes: notes || null,
    photo_url: photoUrl || null,
  };
  if (performedOn) row.performed_on = performedOn;
  const { data, error } = await supabase.from('workout_logs').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function deleteLog(id) {
  // Read the photo first: once the row is gone there is nothing left pointing at
  // the stored object, and an orphaned progress photo used to stay reachable
  // for anyone who had ever held its link.
  const { data } = await supabase.from('workout_logs').select('photo_url').eq('id', id).maybeSingle();

  const { error } = await supabase.from('workout_logs').delete().eq('id', id);
  if (error) throw error;

  // Best-effort: the log is already gone, and a failed cleanup shouldn't surface
  // as a failed delete.
  if (data?.photo_url) await deleteProgressPhoto(data.photo_url).catch(() => {});
}

export async function listLogs({ category, splitDay, from, to } = {}) {
  let q = supabase
    .from('workout_logs')
    .select('*')
    .order('performed_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (category && category !== 'all') q = q.eq('category', category);
  if (splitDay && splitDay !== 'all') q = q.eq('split_day', splitDay);
  if (from) q = q.gte('performed_on', from);
  if (to) q = q.lte('performed_on', to);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Logs for one exercise, oldest -> newest (for charts / PR / progress status).
export async function exerciseHistory(exerciseId) {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('exercise_id', exerciseId)
    .order('performed_on', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function lastLogFor(exerciseId) {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('exercise_id', exerciseId)
    .order('performed_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
