import { supabase } from './supabase';

// Asks the `workout-summary` edge function for a one-line motivational note and
// stores it on the log, so the blurb stays under the entry on later visits
// instead of being regenerated (and re-billed) every time the list loads.
export async function summarizeWorkout(log) {
  const { data, error } = await supabase.functions.invoke('workout-summary', {
    body: {
      exercise: log.exercise_name,
      splitDay: log.split_day,
      sets: log.sets,
      notes: log.notes,
      performedOn: log.performed_on,
    },
  });

  // Non-2xx responses arrive as FunctionsHttpError with the body on `context`.
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }

  const summary = String(data?.summary || '').trim();
  if (!summary) throw new Error('The coach returned an empty summary.');

  const { error: saveError } = await supabase
    .from('workout_logs')
    .update({ ai_summary: summary })
    .eq('id', log.id);
  if (saveError) throw saveError;

  return summary;
}
