import crypto from 'node:crypto'

function sessionError(res, status, error) {
  return res.status(status).json({ error })
}

export function registerSessionRoutes({ app, pool, atlasRequireAuth, atlasRole }) {
  app.post('/atlas-api/workouts/:id/start', atlasRequireAuth, atlasRole('student'), async (req, res, next) => {
    try {
      const { rows: workoutRows } = await pool.query(
        'SELECT id FROM atlas_workouts WHERE id = $1 AND student_id = $2',
        [req.params.id, req.atlasUser.id]
      )
      if (!workoutRows[0]) return sessionError(res, 404, 'Treino não encontrado.')

      const { rows: prescriptions } = await pool.query(
        `SELECT id, name
         FROM atlas_workout_prescriptions
         WHERE workout_id = $1
         ORDER BY position`,
        [req.params.id]
      )
      if (!prescriptions.length) return sessionError(res, 400, 'Este treino não possui prescrições.')

      let prescriptionId = String(req.body?.prescriptionId || '').trim()
      if (!prescriptionId && prescriptions.length === 1) prescriptionId = prescriptions[0].id
      if (!prescriptionId) return sessionError(res, 400, 'Selecione a prescrição que deseja executar.')
      if (!prescriptions.some((item) => item.id === prescriptionId)) {
        return sessionError(res, 404, 'Prescrição não encontrada neste treino.')
      }

      const { rows: openSessions } = await pool.query(
        `SELECT id, prescription_id AS "prescriptionId", started_at AS "startedAt"
         FROM atlas_workout_sessions
         WHERE workout_id = $1 AND student_id = $2
           AND prescription_id = $3 AND completed_at IS NULL
         ORDER BY started_at DESC
         LIMIT 1`,
        [req.params.id, req.atlasUser.id, prescriptionId]
      )
      if (openSessions[0]) return res.json(openSessions[0])

      const id = crypto.randomUUID()
      const { rows } = await pool.query(
        `INSERT INTO atlas_workout_sessions (id, workout_id, prescription_id, student_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, prescription_id AS "prescriptionId",
                   started_at AS "startedAt", completed_at AS "completedAt"`,
        [id, req.params.id, prescriptionId, req.atlasUser.id]
      )
      res.status(201).json(rows[0])
    } catch (error) { next(error) }
  })

  app.get('/atlas-api/sessions/:id', atlasRequireAuth, atlasRole('student'), async (req, res, next) => {
    try {
      const { rows: sessions } = await pool.query(
        `SELECT ws.id, ws.workout_id AS "workoutId",
                ws.prescription_id AS "prescriptionId",
                ws.started_at AS "startedAt", ws.completed_at AS "completedAt",
                ws.notes, w.name AS "workoutName",
                p.name AS "prescriptionName",
                p.estimated_minutes AS "estimatedMinutes"
         FROM atlas_workout_sessions ws
         JOIN atlas_workouts w ON w.id = ws.workout_id
         LEFT JOIN atlas_workout_prescriptions p ON p.id = ws.prescription_id
         WHERE ws.id = $1 AND ws.student_id = $2`,
        [req.params.id, req.atlasUser.id]
      )
      if (!sessions[0]) return sessionError(res, 404, 'Execução não encontrada.')

      const { rows: exercises } = await pool.query(
        `SELECT e.id, e.exercise_id AS "exerciseId", e.name, e.sets, e.reps,
                e.suggested_weight::float8 AS "suggestedWeight",
                e.rest_seconds AS "restSeconds", e.notes,
                e.video_url AS "videoUrl", e.position
         FROM atlas_workout_exercises e
         WHERE e.workout_id = $1 AND e.prescription_id = $2
         ORDER BY e.position`,
        [sessions[0].workoutId, sessions[0].prescriptionId]
      )
      const { rows: logs } = await pool.query(
        `SELECT id, exercise_id AS "exerciseId", set_number AS "setNumber",
                reps, weight::float8 AS weight, completed, notes
         FROM atlas_set_logs
         WHERE session_id = $1
         ORDER BY exercise_id, set_number`,
        [req.params.id]
      )
      res.json({ ...sessions[0], exercises, logs })
    } catch (error) { next(error) }
  })

  app.put('/atlas-api/sessions/:sessionId/exercises/:exerciseId/sets/:setNumber', atlasRequireAuth, atlasRole('student'), async (req, res, next) => {
    try {
      const setNumber = Math.max(1, Number.parseInt(req.params.setNumber, 10) || 1)
      const reps = Math.max(0, Number.parseInt(req.body?.reps, 10) || 0)
      const weight = Math.max(0, Number(req.body?.weight) || 0)
      const notes = String(req.body?.notes || '').trim().slice(0, 300)

      const ownership = await pool.query(
        `SELECT 1
         FROM atlas_workout_sessions ws
         JOIN atlas_workout_exercises e
           ON e.workout_id = ws.workout_id AND e.prescription_id = ws.prescription_id
         WHERE ws.id = $1 AND ws.student_id = $2
           AND e.id = $3 AND ws.completed_at IS NULL`,
        [req.params.sessionId, req.atlasUser.id, req.params.exerciseId]
      )
      if (!ownership.rowCount) return sessionError(res, 404, 'Série ou execução não encontrada.')

      const { rows } = await pool.query(
        `INSERT INTO atlas_set_logs
          (id, session_id, exercise_id, set_number, reps, weight, completed, notes)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
         ON CONFLICT (session_id, exercise_id, set_number)
         DO UPDATE SET reps = EXCLUDED.reps, weight = EXCLUDED.weight,
                       completed = TRUE, notes = EXCLUDED.notes
         RETURNING id, exercise_id AS "exerciseId", set_number AS "setNumber",
                   reps, weight::float8 AS weight, completed, notes`,
        [
          crypto.randomUUID(), req.params.sessionId, req.params.exerciseId,
          setNumber, reps, weight, notes,
        ]
      )
      res.json(rows[0])
    } catch (error) { next(error) }
  })

  app.post('/atlas-api/sessions/:id/complete', atlasRequireAuth, atlasRole('student'), async (req, res, next) => {
    try {
      const { rows: sessionRows } = await pool.query(
        `SELECT ws.id, ws.workout_id, ws.prescription_id
         FROM atlas_workout_sessions ws
         WHERE ws.id = $1 AND ws.student_id = $2 AND ws.completed_at IS NULL`,
        [req.params.id, req.atlasUser.id]
      )
      if (!sessionRows[0]) return sessionError(res, 404, 'Execução aberta não encontrada.')

      const { rows: exerciseRows } = await pool.query(
        `SELECT id, sets
         FROM atlas_workout_exercises
         WHERE workout_id = $1 AND prescription_id = $2`,
        [sessionRows[0].workout_id, sessionRows[0].prescription_id]
      )
      const requiredSets = exerciseRows.reduce((sum, item) => sum + Number(item.sets || 0), 0)
      const { rows: countRows } = await pool.query(
        'SELECT COUNT(*)::int AS count FROM atlas_set_logs WHERE session_id = $1 AND completed = TRUE',
        [req.params.id]
      )
      if (countRows[0].count < requiredSets) {
        return res.status(400).json({
          error: 'Conclua todas as séries antes de finalizar a prescrição.',
          completedSets: countRows[0].count,
          requiredSets,
        })
      }

      const notes = String(req.body?.notes || '').trim().slice(0, 1000)
      const { rows } = await pool.query(
        `UPDATE atlas_workout_sessions
         SET completed_at = NOW(), notes = $2
         WHERE id = $1
         RETURNING id, prescription_id AS "prescriptionId",
                   started_at AS "startedAt", completed_at AS "completedAt", notes`,
        [req.params.id, notes]
      )
      res.json(rows[0])
    } catch (error) { next(error) }
  })
}
