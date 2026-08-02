-- The pre-planned courses on the Courses tab. Re-runnable: matched on `slug`,
-- so editing a price or a blurb here and re-applying updates the live row
-- instead of creating a duplicate.
insert into public.courses
  (slug, title, subtitle, description, level, focus, weeks, sessions_per_week, price, currency, highlights, sort_index)
values
  (
    'foundations-8',
    'Foundations',
    'Your first 8 weeks under the bar',
    'A full-body beginner block that teaches the six main lifts before it asks you to load them. Every session is three compounds and two accessories, with technique checkpoints you have to clear before the weight goes up.',
    'Beginner', 'Full Body', 8, 3, 12.500, 'KWD',
    array[
      '24 sessions, laid out day by day',
      'Squat, hinge, press, pull, carry, brace',
      'Load only rises when the checkpoint is cleared',
      'Auto-fills your Weekly Plan'
    ],
    10
  ),
  (
    'push-pull-legs-12',
    'Push / Pull / Legs',
    'Twelve weeks of classic hypertrophy',
    'The split that built most of the gym. Six training days a week across three rotations, with volume that steps up every three weeks and a deload before the block ends.',
    'Intermediate', 'Push', 12, 6, 19.000, 'KWD',
    array[
      '72 sessions across three rotations',
      'Volume steps up every third week',
      'Built-in deload in week 11',
      'Per-exercise rep targets and rest timers'
    ],
    20
  ),
  (
    'upper-lower-10',
    'Upper / Lower Power',
    'Strength on the heavy days, size on the rest',
    'Four days a week: two heavy upper/lower sessions in the 3-5 rep range, two lighter ones in the 8-12 range. The heavy days drive the numbers, the light days drive the size.',
    'Intermediate', 'Upper', 10, 4, 16.500, 'KWD',
    array[
      '40 sessions, two heavy and two light each week',
      'Top-set / back-off loading',
      'Tracks estimated 1RM as you go',
      'Accessory swaps for missing equipment'
    ],
    30
  ),
  (
    'lean-cut-6',
    'Lean Cut',
    'Hold the muscle while the weight comes off',
    'Six weeks of shorter, denser sessions built for a calorie deficit. Loads stay heavy so you keep what you built; the work rate rises instead of the volume.',
    'Intermediate', 'Full Body', 6, 4, 11.000, 'KWD',
    array[
      '24 sessions, none over 50 minutes',
      'Supersets and short rest to keep density high',
      'Strength-retention checkpoints each week',
      'Weekly progress-photo prompts'
    ],
    40
  ),
  (
    'posterior-chain-8',
    'Posterior Chain',
    'Back, glutes and hamstrings, rebuilt',
    'A pull-biased block for anyone whose front side has run ahead of their back side. Heavy hinging twice a week, rows every session, and enough direct hamstring work to make sitting down interesting.',
    'Intermediate', 'Pull', 8, 4, 14.000, 'KWD',
    array[
      '32 sessions, hinge-heavy',
      'Deadlift and RDL progressions side by side',
      'Row volume tracked weekly',
      'Mobility work that actually fits in the session'
    ],
    50
  ),
  (
    'peak-strength-16',
    'Peak Strength',
    'Sixteen weeks to a bigger total',
    'A full periodised run at squat, bench and deadlift: accumulation, intensification, peak, test week. Percentages come off your entered maxes and adjust as your logged sets say they should.',
    'Advanced', 'Lower', 16, 4, 27.500, 'KWD',
    array[
      '64 sessions across four phases',
      'Percentage-based, keyed to your own maxes',
      'Auto-regulated: bad weeks pull the load back',
      'Test week with a full opener / second / third plan'
    ],
    60
  )
on conflict (slug) do update set
  title             = excluded.title,
  subtitle          = excluded.subtitle,
  description       = excluded.description,
  level             = excluded.level,
  focus             = excluded.focus,
  weeks             = excluded.weeks,
  sessions_per_week = excluded.sessions_per_week,
  price             = excluded.price,
  currency          = excluded.currency,
  highlights        = excluded.highlights,
  sort_index        = excluded.sort_index,
  is_active         = true;
