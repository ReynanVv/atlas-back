import crypto from 'node:crypto'
import { isWorkoutEditable } from '../domain/workouts.js'
import { cleanText, normalizePrescription } from './shared.js'
import { insertPrescriptions, replacePrescriptions, validateStudentAvailability, workoutLegacyFields } from './workout-persistence.js'
import { loadOwnedWorkout, loadWorkoutPayload } from './workout-data.js'

async function templateFallback(pool, trainerId, templateId, body) {
  if (!templateId) return null
  const { rows } = await pool.query(
    'SELECT * FROM atlas_workout_templates WHERE id = $1 AND trainer_id = $2',
    [templateId, trainerId]
  )
  const template = rows[0]
  if (!template) {
    const error = new Error('Template não encontrado.')
    error.statusCode = 404
    throw error
  }
  const result = await pool.query(
    `SELECT exercise_id AS "exerciseId", name, sets, reps,
            suggested_weight::float8 AS "suggestedWeight",
            rest_seconds AS "restSeconds", video_url AS "videoUrl", notes
     FROM atlas_template_exercises
     WHERE template_id = $1
     ORDER BY position`,
    [templateId]
  )
  return {
    template,
    prescription: {
      name: template.name || 'Prescrição 1',
      notes: template.notes || '',
      estimatedMinutes: Number(body?.estimatedMinutes ?? template.estimated_minutes ?? 0),
      scheduledDays: body?.scheduledDays,
      exercises: result.rows,
    },
  }
}

async function prescriptionsFromBody(pool, trainerId, body, existing = null) {
  if (Array.isArray(body?.prescriptions) && body.prescriptions.length) {
    return body.prescriptions.map(normalizePrescription)
  }

  if (existing?.prescriptions?.length && body?.prescriptions === undefined) {
    return existing.prescriptions.map((item, index) => normalizePrescription({
      id: item.id,
      name: item.name,
      notes: item.notes,
      estimatedMinutes: item.estimatedMinutes,
      scheduledDays: item.scheduledDays,
      exercises: item.exercises,
    }, index))
  }

  const templateId = body?.templateId ? String(body.templateId) : null
  const fallback = await templateFallback(pool, trainerId, templateId, body)
  const exercises = Array.isArray(body?.exercises) && body.exercises.length
    ? body.exercises
    : fallback?.prescription?.exercises || []
  return [normalizePrescription({
    name: body?.prescriptionName || fallback?.prescription?.name || 'Prescrição 1',
    notes: body?.prescriptionNotes || '',
    estimatedMinutes: body?.estimatedMinutes ?? fallback?.prescription?.estimatedMinutes ?? 0,
    scheduledDays: body?.scheduledDays,
    exercises,
  }, 0)]
}

function sendRouteError(res, next, error) {
  if (error?.statusCode) {
    return res.status(error.statusCode).json({
      error: error.message,
      ...(error.availability ? { availability: error.availability } : {}),
    })
  }
  next(error)
}

export function registerWorkoutRoutes({ app, pool, atlasRequireAuth, atlasRole }) {
  app.get('/atlas-api/workouts', atlasRequireAuth, async (req, res, next) => {
    try {
      const ownerColumn = req.atlasUser.role === 'trainer' ? 'w.trainer_id' : 'w.student_id'
      const { rows: workouts } = await pool.query(
        `SELECT w.*, t.name AS trainer_name, t.avatar_url AS trainer_avatar_url,
                s.name AS student_name
         FROM atlas_workouts w
         JOIN atlas_users t ON t.id = w.trainer_id
         JOIN atlas_users s ON s.id = w.student_id
         WHERE ${ownerColumn} = $1
         ORDER BY w.created_at DESC`,
        [req.atlasUser.id]
      )
      const result = []
      for (const workout of workouts) result.push(await loadWorkoutPayload(pool, workout))
      res.json(result)
    } catch (error) { next(error) }
  })

  app.post('/atlas-api/workouts', atlasRequireAuth, atlasRole('trainer'), async (req, res, next) => {
    try {
      const studentId = String(req.body?.studentId || '').trim()
      if (!studentId) return res.status(400).json({ error: 'Selecione um aluno.' })
      const templateId = req.body?.templateId ? String(req.body.templateId) : null
      const name = cleanText(req.body?.name, 'Nome do treino', true, 120)
      const description = cleanText(req.body?.description, 'Descrição', false, 2000)
      const notes = cleanText(req.body?.notes, 'Observações', false, 3000)
      const prescriptions = await prescriptionsFromBody(pool, req.atlasUser.id, req.body)
      await validateStudentAvailability(pool, req.atlasUser.id, studentId, prescriptions)
      const legacy = workoutLegacyFields(prescriptions)

      const workoutId = crypto.randomUUID()
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `INSERT INTO atlas_workouts
            (id, trainer_id, student_id, name, model, description,
             estimated_minutes, scheduled_time, template_id, notes, scheduled_days)
           VALUES ($1, $2, $3, $4, 'CUSTOM', $5, $6, '', $7, $8, $9::smallint[])`,
          [
            workoutId, req.atlasUser.id, studentId, name, description,
            legacy.estimatedMinutes, templateId, notes, legacy.scheduledDays,
          ]
        )
        await insertPrescriptions(client, workoutId, prescriptions)
        await client.query(
          `INSERT INTO atlas_notifications
            (id, user_id, type, title, body, reference_id, occurrence_key)
           VALUES ($1, $2, 'workout_prescribed', 'Novo treino prescrito', $3, $4, '')
           ON CONFLICT (user_id, type, reference_id, occurrence_key) DO NOTHING`,
          [crypto.randomUUID(), studentId, name, workoutId]
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }

      const workout = await loadOwnedWorkout(pool, workoutId, req.atlasUser.id)
      res.status(201).json(await loadWorkoutPayload(pool, workout))
    } catch (error) { sendRouteError(res, next, error) }
  })

  app.patch('/atlas-api/workouts/:id', atlasRequireAuth, atlasRole('trainer'), async (req, res, next) => {
    try {
      const current = await loadOwnedWorkout(pool, req.params.id, req.atlasUser.id)
      if (!current) return res.status(404).json({ error: 'Treino não encontrado.' })

      const sessionCount = await pool.query(
        'SELECT COUNT(*)::int AS count FROM atlas_workout_sessions WHERE workout_id = $1',
        [current.id]
      )
      if (!isWorkoutEditable(sessionCount.rows[0]?.count)) {
        return res.status(409).json({
          error: 'Este treino já foi iniciado e não pode mais ser editado. Isso preserva o histórico de execução do aluno.',
        })
      }

      const currentPayload = await loadWorkoutPayload(pool, current)
      const studentId = req.body?.studentId == null ? current.student_id : String(req.body.studentId || '').trim()
      const templateId = req.body?.templateId === undefined
        ? current.template_id
        : req.body.templateId ? String(req.body.templateId) : null
      const name = req.body?.name == null ? current.name : cleanText(req.body.name, 'Nome do treino', true, 120)
      const description = req.body?.description == null
        ? (current.description || '')
        : cleanText(req.body.description, 'Descrição', false, 2000)
      const notes = req.body?.notes == null
        ? (current.notes || '')
        : cleanText(req.body.notes, 'Observações', false, 3000)
      const prescriptions = await prescriptionsFromBody(pool, req.atlasUser.id, req.body, currentPayload)
      await validateStudentAvailability(pool, req.atlasUser.id, studentId, prescriptions)
      const legacy = workoutLegacyFields(prescriptions)

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `UPDATE atlas_workouts
           SET student_id = $3, name = $4, model = 'CUSTOM', description = $5,
               estimated_minutes = $6, scheduled_time = '', template_id = $7,
               notes = $8, scheduled_days = $9::smallint[]
           WHERE id = $1 AND trainer_id = $2`,
          [
            current.id, req.atlasUser.id, studentId, name, description,
            legacy.estimatedMinutes, templateId, notes, legacy.scheduledDays,
          ]
        )
        await replacePrescriptions(client, current.id, prescriptions)

        if (current.student_id !== studentId) {
          await client.query(
            `DELETE FROM atlas_notifications
             WHERE user_id = $1 AND type = 'workout_prescribed' AND reference_id = $2`,
            [current.student_id, current.id]
          )
          await client.query(
            `INSERT INTO atlas_notifications
              (id, user_id, type, title, body, reference_id, occurrence_key)
             VALUES ($1, $2, 'workout_prescribed', 'Novo treino prescrito', $3, $4, '')
             ON CONFLICT (user_id, type, reference_id, occurrence_key) DO NOTHING`,
            [crypto.randomUUID(), studentId, name, current.id]
          )
        }
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }

      const workout = await loadOwnedWorkout(pool, current.id, req.atlasUser.id)
      res.json(await loadWorkoutPayload(pool, workout))
    } catch (error) { sendRouteError(res, next, error) }
  })
}
