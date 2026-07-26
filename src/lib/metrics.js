// Pure helpers for turning logged sets into progress numbers.

export function setVolume(s) {
  return (Number(s.reps) || 0) * (Number(s.weight) || 0);
}

export function logVolume(log) {
  return (log.sets || []).reduce((sum, s) => sum + setVolume(s), 0);
}

export function topWeight(log) {
  return (log.sets || []).reduce((m, s) => Math.max(m, Number(s.weight) || 0), 0);
}

// Estimated 1-rep max (Epley). Lets us compare sets with different rep counts.
export function epley1RM(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  return w * (1 + r / 30);
}

export function bestE1RM(log) {
  return (log.sets || []).reduce((m, s) => Math.max(m, epley1RM(s.weight, s.reps)), 0);
}

export function totalReps(log) {
  return (log.sets || []).reduce((n, s) => n + (Number(s.reps) || 0), 0);
}

// Given logs for ONE exercise sorted oldest -> newest, mark which sessions set
// a new estimated-1RM record.
export function markPRs(logsAsc) {
  let best = 0;
  return logsAsc.map((log) => {
    const e = bestE1RM(log);
    const isPR = e > best + 0.001;
    if (isPR) best = e;
    return { ...log, e1rm: e, isPR };
  });
}

// progressing | plateaued | new — based on the last two sessions of an exercise.
export function progressStatus(logsAsc) {
  if (logsAsc.length < 2) return 'new';
  const last = bestE1RM(logsAsc[logsAsc.length - 1]);
  const prev = bestE1RM(logsAsc[logsAsc.length - 2]);
  if (last > prev + 0.5) return 'progressing';
  if (last < prev - 0.5) return 'regressing';
  return 'plateaued';
}

export const statusMeta = {
  progressing: { label: 'Progressing', color: '#00E0A4', icon: '▲' },
  plateaued: { label: 'Plateaued', color: '#FFB020', icon: '▶' },
  regressing: { label: 'Down', color: '#FF5A5F', icon: '▼' },
  new: { label: 'New', color: '#93A0B4', icon: '★' },
};

// yyyy-mm-dd for a Date, in local time (Supabase `date` columns are plain dates).
export function isoDate(d = new Date()) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

export function prettyDate(iso) {
  if (!iso) return '';
  const [y, m, day] = iso.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
