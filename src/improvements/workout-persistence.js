import crypto from 'node:crypto'
import { unionPrescriptionDays } from './shared.js'

export async function insertPrescriptions(client, workoutId, prescriptions) {
  for (let position = 0; position < prescriptions.length; position += 1) {
    const prescription = prescriptions[position]
    const prescriptionId = crypto.randomUUID()
    await client.query(
      `INSERT INTO atlas_workout_prescriptions
        (id, workout_id, name, notes, estimated_minutes, scheduled_days, position)
       VALUES ($1, $2, $3, $4, $5, $6::smallint[], $7)`,
      [
        prescriptionId, workoutId, prescription.name, prescription.notes,
        prescription.estimatedMinutes, prescription.scheduledDays, position,
      ]
    )

    for (let exercisePosition = 0; exercisePosition < prescription.exercises.length; exercisePosition += 1) {
      const exercise = prescription.exercises[exercisePosition]
      await client.query(
        `INSERT INTO atlas_workout_exercises
          (id, workout_id, prescription_id, exercise_id, name, sets, reps,
           suggested_weight, rest_seconds, notes, video_url, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          crypto.randomUUID(), workoutId, prescriptionId, exercise.exerciseId,
          exercise.name, exercise.sets, exercise.reps, exercise.suggestedWeight,
          exercise.restSeconds, exercise.notes, exercise.videoUrl, exercisePosition,
        ]
      )
    }
  }
}

export async function replacePrescriptions(client, workoutId, prescriptions) {
  await client.query('DELETE FROM atlas_workout_exercises WHERE workout_id = $1', [workoutId])
  await client.query('DELETE FROM atlas_workout_prescriptions WHERE workout_id = $1', [workoutId])
  await insertPrescriptions(client, workoutId, prescriptions)
}

export async function validateStudentAvailability(pool, trainerId, studentId, prescriptions) {
  const linked = await pool.query(
    'SELECT 1 FROM atlas_trainer_students WHERE trainer_id = $1 AND student_id = $2',
    [trainerId, studentId]
  )
  if (!linked.rowCount) {
    const error = new Error('Aluno não vinculado.')
    error.statusCode = 400
    throw error
  }

  const availabilityResult = await pool.query(
    'SELECT day_of_week FROM atlas_availability WHERE student_id = $1 ORDER BY day_of_week',
    [studentId]
  )
  const availability = availabilityResult.rows.map((item) => Number(item.day_of_week))
  if (!availability.length) {
    const error = new Error('O aluno ainda não informou a disponibilidade.')
    error.statusCode = 400
    throw error
  }

  const invalid = prescriptions.some((prescription) =>
    prescription.scheduledDays.some((day) => !availability.includes(day))
  )
  if (invalid) {
    const error = new Error('As prescrições só podem usar dias disponíveis do aluno.')
    error.statusCode = 400
    error.availability = availability
    throw error
  }
  return availability
}

export function workoutLegacyFields(prescriptions) {
  return {
    scheduledDays: unionPrescriptionDays(prescriptions),
    estimatedMinutes: Math.max(0, ...prescriptions.map((item) => Number(item.estimatedMinutes || 0))),
  }
}
