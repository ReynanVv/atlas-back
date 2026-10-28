import crypto from 'node:crypto'

export async function ensureAtlasImprovementsSchema(pool) {
  await pool.query(`
    ALTER TABLE atlas_users
      ADD COLUMN IF NOT EXISTS trainer_public BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS atlas_workout_prescriptions (
      id UUID PRIMARY KEY,
      workout_id UUID NOT NULL REFERENCES atlas_workouts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      estimated_minutes INTEGER NOT NULL DEFAULT 0,
      scheduled_days SMALLINT[] NOT NULL DEFAULT '{}',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS atlas_template_prescriptions (
      id UUID PRIMARY KEY,
      template_id UUID NOT NULL REFERENCES atlas_workout_templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      estimated_minutes INTEGER NOT NULL DEFAULT 0,
      scheduled_days SMALLINT[] NOT NULL DEFAULT '{}',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS atlas_trainer_link_requests (
      id UUID PRIMARY KEY,
      trainer_id UUID NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      responded_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS atlas_trainer_reviews (
      id UUID PRIMARY KEY,
      trainer_id UUID NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
      rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (trainer_id, student_id)
    );

    ALTER TABLE atlas_workout_exercises
      ADD COLUMN IF NOT EXISTS prescription_id UUID;

    ALTER TABLE atlas_workout_sessions
      ADD COLUMN IF NOT EXISTS prescription_id UUID;

    ALTER TABLE atlas_template_exercises
      ADD COLUMN IF NOT EXISTS prescription_id UUID;

    CREATE INDEX IF NOT EXISTS idx_atlas_prescriptions_workout
      ON atlas_workout_prescriptions(workout_id, position);
    CREATE INDEX IF NOT EXISTS idx_atlas_workout_exercises_prescription
      ON atlas_workout_exercises(prescription_id);
    CREATE INDEX IF NOT EXISTS idx_atlas_sessions_prescription
      ON atlas_workout_sessions(prescription_id);
    CREATE INDEX IF NOT EXISTS idx_atlas_template_prescriptions_template
      ON atlas_template_prescriptions(template_id, position);
    CREATE INDEX IF NOT EXISTS idx_atlas_template_exercises_prescription
      ON atlas_template_exercises(prescription_id);
    CREATE INDEX IF NOT EXISTS idx_atlas_link_requests_trainer
      ON atlas_trainer_link_requests(trainer_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_atlas_link_requests_student
      ON atlas_trainer_link_requests(student_id, status, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_atlas_link_requests_pending
      ON atlas_trainer_link_requests(trainer_id, student_id)
      WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS idx_atlas_trainer_reviews_trainer
      ON atlas_trainer_reviews(trainer_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_atlas_trainer_reviews_student
      ON atlas_trainer_reviews(student_id, updated_at DESC);
  `)


  const { rows: legacyTemplates } = await pool.query(`
    SELECT t.id, t.name, t.notes, t.estimated_minutes
    FROM atlas_workout_templates t
    WHERE NOT EXISTS (
      SELECT 1 FROM atlas_template_prescriptions p WHERE p.template_id = t.id
    )
  `)

  for (const template of legacyTemplates) {
    const prescriptionId = crypto.randomUUID()
    await pool.query(
      `INSERT INTO atlas_template_prescriptions
        (id, template_id, name, notes, estimated_minutes, scheduled_days, position)
       VALUES ($1, $2, $3, $4, $5, '{}'::smallint[], 0)`,
      [
        prescriptionId,
        template.id,
        template.name || 'Prescrição 1',
        template.notes || '',
        Number(template.estimated_minutes || 0),
      ]
    )
    await pool.query(
      'UPDATE atlas_template_exercises SET prescription_id = $2 WHERE template_id = $1 AND prescription_id IS NULL',
      [template.id, prescriptionId]
    )
  }

  const { rows: orphanTemplateExercises } = await pool.query(`
    SELECT DISTINCT e.template_id
    FROM atlas_template_exercises e
    WHERE e.prescription_id IS NULL
  `)
  for (const row of orphanTemplateExercises) {
    const { rows } = await pool.query(
      'SELECT id FROM atlas_template_prescriptions WHERE template_id = $1 ORDER BY position LIMIT 1',
      [row.template_id]
    )
    if (rows[0]) {
      await pool.query(
        'UPDATE atlas_template_exercises SET prescription_id = $2 WHERE template_id = $1 AND prescription_id IS NULL',
        [row.template_id, rows[0].id]
      )
    }
  }

  const { rows: legacyWorkouts } = await pool.query(`
    SELECT w.id, w.scheduled_days, w.estimated_minutes
    FROM atlas_workouts w
    WHERE NOT EXISTS (
      SELECT 1 FROM atlas_workout_prescriptions p WHERE p.workout_id = w.id
    )
  `)

  for (const workout of legacyWorkouts) {
    const prescriptionId = crypto.randomUUID()
    await pool.query(
      `INSERT INTO atlas_workout_prescriptions
        (id, workout_id, name, notes, estimated_minutes, scheduled_days, position)
       VALUES ($1, $2, 'Prescrição 1', '', $3, $4::smallint[], 0)`,
      [prescriptionId, workout.id, Number(workout.estimated_minutes || 0), workout.scheduled_days || []]
    )
    await pool.query(
      'UPDATE atlas_workout_exercises SET prescription_id = $2 WHERE workout_id = $1 AND prescription_id IS NULL',
      [workout.id, prescriptionId]
    )
    await pool.query(
      'UPDATE atlas_workout_sessions SET prescription_id = $2 WHERE workout_id = $1 AND prescription_id IS NULL',
      [workout.id, prescriptionId]
    )
  }

  const { rows: orphanWorkouts } = await pool.query(`
    SELECT DISTINCT e.workout_id
    FROM atlas_workout_exercises e
    WHERE e.prescription_id IS NULL
  `)
  for (const row of orphanWorkouts) {
    const { rows } = await pool.query(
      'SELECT id FROM atlas_workout_prescriptions WHERE workout_id = $1 ORDER BY position LIMIT 1',
      [row.workout_id]
    )
    if (rows[0]) {
      await pool.query(
        'UPDATE atlas_workout_exercises SET prescription_id = $2 WHERE workout_id = $1 AND prescription_id IS NULL',
        [row.workout_id, rows[0].id]
      )
    }
  }
}
