import crypto from 'node:crypto'
import { cleanText, normalizeExercise } from './shared.js'

function normalizeTemplatePrescription(input = {}, index = 0) {
  const exercises = Array.isArray(input.exercises) ? input.exercises.map(normalizeExercise) : []
  if (!exercises.length) throw new Error(`Adicione pelo menos um exercício à prescrição ${index + 1}.`)
  const days = [...new Set((Array.isArray(input.scheduledDays) ? input.scheduledDays : []).map(Number))]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b)
  return {
    name: cleanText(input.name, 'Nome da prescrição', true, 80),
    notes: cleanText(input.notes, 'Observações da prescrição', false, 1500),
    estimatedMinutes: Math.max(0, Math.min(600, Number.parseInt(input.estimatedMinutes, 10) || 0)),
    scheduledDays: days,
    exercises,
  }
}

async function templatePayload(pool, template) {
  const { rows: prescriptions } = await pool.query(
    `SELECT id, name, notes, estimated_minutes AS "estimatedMinutes",
            scheduled_days AS "scheduledDays", position
     FROM atlas_template_prescriptions
     WHERE template_id = $1
     ORDER BY position`,
    [template.id]
  )

  const result = []
  for (const prescription of prescriptions) {
    const { rows: exercises } = await pool.query(
      `SELECT id, exercise_id AS "exerciseId", name, sets, reps,
              suggested_weight::float8 AS "suggestedWeight",
              rest_seconds AS "restSeconds", video_url AS "videoUrl",
              notes, position
       FROM atlas_template_exercises
       WHERE template_id = $1 AND prescription_id = $2
       ORDER BY position`,
      [template.id, prescription.id]
    )
    result.push({ ...prescription, scheduledDays: prescription.scheduledDays || [], exercises })
  }

  const legacy = result[0] || null
  return {
    id: template.id,
    name: template.name,
    description: template.description || '',
    notes: template.notes || '',
    estimatedMinutes: legacy?.estimatedMinutes || Number(template.estimated_minutes || 0),
    prescriptions: result,
    exercises: legacy?.exercises || [],
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  }
}

async function insertTemplatePrescriptions(client, templateId, prescriptions) {
  for (let position = 0; position < prescriptions.length; position += 1) {
    const prescription = prescriptions[position]
    const prescriptionId = crypto.randomUUID()
    await client.query(
      `INSERT INTO atlas_template_prescriptions
        (id, template_id, name, notes, estimated_minutes, scheduled_days, position)
       VALUES ($1, $2, $3, $4, $5, $6::smallint[], $7)`,
      [
        prescriptionId, templateId, prescription.name, prescription.notes,
        prescription.estimatedMinutes, prescription.scheduledDays, position,
      ]
    )
    for (let exercisePosition = 0; exercisePosition < prescription.exercises.length; exercisePosition += 1) {
      const exercise = prescription.exercises[exercisePosition]
      await client.query(
        `INSERT INTO atlas_template_exercises
          (id, template_id, prescription_id, exercise_id, name, sets, reps,
           suggested_weight, rest_seconds, video_url, notes, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          crypto.randomUUID(), templateId, prescriptionId, exercise.exerciseId,
          exercise.name, exercise.sets, exercise.reps, exercise.suggestedWeight,
          exercise.restSeconds, exercise.videoUrl, exercise.notes, exercisePosition,
        ]
      )
    }
  }
}

function normalizeTemplateBody(body) {
  if (Array.isArray(body?.prescriptions) && body.prescriptions.length) {
    return body.prescriptions.map(normalizeTemplatePrescription)
  }
  const exercises = Array.isArray(body?.exercises) ? body.exercises : []
  return [normalizeTemplatePrescription({
    name: body?.prescriptionName || body?.name || 'Prescrição 1',
    notes: body?.notes || '',
    estimatedMinutes: body?.estimatedMinutes || 0,
    scheduledDays: body?.scheduledDays || [],
    exercises,
  }, 0)]
}

export function registerTemplateRoutes({ app, pool, atlasRequireAuth, atlasRole }) {
  app.get('/atlas-api/templates', atlasRequireAuth, atlasRole('trainer'), async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT *
         FROM atlas_workout_templates
         WHERE trainer_id = $1
         ORDER BY updated_at DESC, created_at DESC`,
        [req.atlasUser.id]
      )
      const result = []
      for (const template of rows) result.push(await templatePayload(pool, template))
      res.json(result)
    } catch (error) { next(error) }
  })

  app.post('/atlas-api/templates', atlasRequireAuth, atlasRole('trainer'), async (req, res, next) => {
    const client = await pool.connect()
    try {
      const name = cleanText(req.body?.name, 'Nome do template', true, 120)
      const description = cleanText(req.body?.description, 'Descrição', false, 2000)
      const notes = cleanText(req.body?.notes, 'Observações gerais', false, 3000)
      const prescriptions = normalizeTemplateBody(req.body)
      const estimatedMinutes = Math.max(0, ...prescriptions.map((item) => item.estimatedMinutes))
      const templateId = crypto.randomUUID()

      await client.query('BEGIN')
      await client.query(
        `INSERT INTO atlas_workout_templates
          (id, trainer_id, name, description, notes, estimated_minutes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [templateId, req.atlasUser.id, name, description, notes, estimatedMinutes]
      )
      await insertTemplatePrescriptions(client, templateId, prescriptions)
      await client.query('COMMIT')

      const { rows } = await pool.query(
        'SELECT * FROM atlas_workout_templates WHERE id = $1 AND trainer_id = $2',
        [templateId, req.atlasUser.id]
      )
      res.status(201).json(await templatePayload(pool, rows[0]))
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      if (/obrigatório|Adicione pelo menos/i.test(error.message || '')) {
        return res.status(400).json({ error: error.message })
      }
      next(error)
    } finally {
      client.release()
    }
  })

  app.patch('/atlas-api/templates/:id', atlasRequireAuth, atlasRole('trainer'), async (req, res, next) => {
    const client = await pool.connect()
    try {
      const { rows: currentRows } = await pool.query(
        'SELECT * FROM atlas_workout_templates WHERE id = $1 AND trainer_id = $2',
        [req.params.id, req.atlasUser.id]
      )
      const current = currentRows[0]
      if (!current) return res.status(404).json({ error: 'Template não encontrado.' })

      const currentPayload = await templatePayload(pool, current)
      const name = req.body?.name == null ? current.name : cleanText(req.body.name, 'Nome do template', true, 120)
      const description = req.body?.description == null
        ? current.description || ''
        : cleanText(req.body.description, 'Descrição', false, 2000)
      const notes = req.body?.notes == null
        ? current.notes || ''
        : cleanText(req.body.notes, 'Observações gerais', false, 3000)
      const prescriptions = req.body?.prescriptions === undefined
        ? currentPayload.prescriptions.map(normalizeTemplatePrescription)
        : normalizeTemplateBody(req.body)
      const estimatedMinutes = Math.max(0, ...prescriptions.map((item) => item.estimatedMinutes))

      await client.query('BEGIN')
      await client.query(
        `UPDATE atlas_workout_templates
         SET name = $3, description = $4, notes = $5,
             estimated_minutes = $6, updated_at = NOW()
         WHERE id = $1 AND trainer_id = $2`,
        [current.id, req.atlasUser.id, name, description, notes, estimatedMinutes]
      )
      await client.query('DELETE FROM atlas_template_exercises WHERE template_id = $1', [current.id])
      await client.query('DELETE FROM atlas_template_prescriptions WHERE template_id = $1', [current.id])
      await insertTemplatePrescriptions(client, current.id, prescriptions)
      await client.query('COMMIT')

      const { rows } = await pool.query(
        'SELECT * FROM atlas_workout_templates WHERE id = $1 AND trainer_id = $2',
        [current.id, req.atlasUser.id]
      )
      res.json(await templatePayload(pool, rows[0]))
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      if (/obrigatório|Adicione pelo menos/i.test(error.message || '')) {
        return res.status(400).json({ error: error.message })
      }
      next(error)
    } finally {
      client.release()
    }
  })

  app.delete('/atlas-api/templates/:id', atlasRequireAuth, atlasRole('trainer'), async (req, res, next) => {
    try {
      const result = await pool.query(
        'DELETE FROM atlas_workout_templates WHERE id = $1 AND trainer_id = $2',
        [req.params.id, req.atlasUser.id]
      )
      if (!result.rowCount) return res.status(404).json({ error: 'Template não encontrado.' })
      res.status(204).end()
    } catch (error) { next(error) }
  })
}
