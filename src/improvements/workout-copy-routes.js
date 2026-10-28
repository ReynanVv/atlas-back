import crypto from 'node:crypto'
import { normalizePrescription } from './shared.js'
import { insertPrescriptions, validateStudentAvailability, workoutLegacyFields } from './workout-persistence.js'
import { loadOwnedWorkout, loadWorkoutPayload } from './workout-data.js'

export function registerWorkoutCopyRoutes({ app, pool, atlasRequireAuth, atlasRole }) {
  app.post('/atlas-api/workouts/:id/copy', atlasRequireAuth, atlasRole('trainer'), async (req, res, next) => {
    try {
      const targetStudentId = String(req.body?.studentId || '').trim()
      if (!targetStudentId) return res.status(400).json({ error: 'Selecione o aluno de destino.' })

      const source = await loadOwnedWorkout(pool, req.params.id, req.atlasUser.id)
      if (!source) return res.status(404).json({ error: 'Treino de origem não encontrado.' })
      if (source.student_id === targetStudentId) {
        return res.status(400).json({ error: 'Escolha um aluno diferente para exportar o treino.' })
      }

      const payload = await loadWorkoutPayload(pool, source)
      const availabilityResult = await pool.query(
        'SELECT day_of_week FROM atlas_availability WHERE student_id = $1 ORDER BY day_of_week',
        [targetStudentId]
      )
      const availability = availabilityResult.rows.map((item) => Number(item.day_of_week))
      if (!availability.length) {
        return res.status(400).json({ error: 'O aluno de destino ainda não informou a disponibilidade.' })
      }

      const fallbackDays = Array.isArray(req.body?.scheduledDays)
        ? [...new Set(req.body.scheduledDays.map(Number))].filter((day) => availability.includes(day))
        : []

      const prescriptions = payload.prescriptions.map((item, index) => {
        const sourceDays = (item.scheduledDays || []).filter((day) => availability.includes(day))
        const scheduledDays = sourceDays.length === item.scheduledDays.length
          ? sourceDays
          : fallbackDays
        return normalizePrescription({
          name: item.name,
          notes: item.notes,
          estimatedMinutes: item.estimatedMinutes,
          scheduledDays,
          exercises: item.exercises,
        }, index)
      })

      await validateStudentAvailability(pool, req.atlasUser.id, targetStudentId, prescriptions)
      const legacy = workoutLegacyFields(prescriptions)
      const copiedWorkoutId = crypto.randomUUID()
      const copiedName = String(req.body?.name || source.name).trim().slice(0, 120) || source.name

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `INSERT INTO atlas_workouts
            (id, trainer_id, student_id, name, model, description,
             estimated_minutes, scheduled_time, template_id, notes, scheduled_days)
           VALUES ($1, $2, $3, $4, 'CUSTOM', $5, $6, '', $7, $8, $9::smallint[])`,
          [
            copiedWorkoutId, req.atlasUser.id, targetStudentId, copiedName,
            source.description || '', legacy.estimatedMinutes, source.template_id || null,
            source.notes || '', legacy.scheduledDays,
          ]
        )
        await insertPrescriptions(client, copiedWorkoutId, prescriptions)
        await client.query(
          `INSERT INTO atlas_notifications
            (id, user_id, type, title, body, reference_id, occurrence_key)
           VALUES ($1, $2, 'workout_prescribed', 'Novo treino prescrito', $3, $4, '')
           ON CONFLICT (user_id, type, reference_id, occurrence_key) DO NOTHING`,
          [crypto.randomUUID(), targetStudentId, copiedName, copiedWorkoutId]
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }

      res.status(201).json({
        id: copiedWorkoutId,
        sourceWorkoutId: source.id,
        studentId: targetStudentId,
        name: copiedName,
        prescriptions: prescriptions.length,
      })
    } catch (error) {
      if (/dia válido|dias disponíveis/i.test(error.message || '')) {
        return res.status(400).json({ error: error.message })
      }
      next(error)
    }
  })
}
