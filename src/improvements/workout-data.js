import { statusForWorkout } from '../domain/workouts.js'
import { overallWorkoutStatus } from './shared.js'

export async function loadWorkoutPayload(pool, workout) {
  const { rows: prescriptions } = await pool.query(
    `SELECT id, name, notes, estimated_minutes AS "estimatedMinutes",
            scheduled_days AS "scheduledDays", position
     FROM atlas_workout_prescriptions
     WHERE workout_id = $1
     ORDER BY position`,
    [workout.id]
  )

  const result = []
  for (const prescription of prescriptions) {
    const { rows: exercises } = await pool.query(
      `SELECT id, exercise_id AS "exerciseId", name, sets, reps,
              suggested_weight::float8 AS "suggestedWeight",
              rest_seconds AS "restSeconds", notes, video_url AS "videoUrl", position
       FROM atlas_workout_exercises
       WHERE workout_id = $1 AND prescription_id = $2
       ORDER BY position`,
      [workout.id, prescription.id]
    )
    const { rows: sessions } = await pool.query(
      `SELECT id, prescription_id AS "prescriptionId",
              started_at AS "startedAt", completed_at AS "completedAt", notes
       FROM atlas_workout_sessions
       WHERE workout_id = $1 AND student_id = $2 AND prescription_id = $3
       ORDER BY started_at DESC
       LIMIT 1`,
      [workout.id, workout.student_id, prescription.id]
    )
    const latestSession = sessions[0] || null
    result.push({
      ...prescription,
      scheduledDays: prescription.scheduledDays || [],
      exercises,
      latestSession,
      status: statusForWorkout({ scheduled_days: prescription.scheduledDays || [] }, latestSession),
    })
  }

  const allExercises = result.flatMap((item) => item.exercises)
  const latestSessions = result.map((item) => item.latestSession).filter(Boolean)
  latestSessions.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
  const scheduledDays = [...new Set(result.flatMap((item) => item.scheduledDays || []))].sort((a, b) => a - b)

  return {
    id: workout.id,
    trainerId: workout.trainer_id,
    studentId: workout.student_id,
    trainerName: workout.trainer_name,
    trainerAvatarUrl: workout.trainer_avatar_url || null,
    studentName: workout.student_name,
    name: workout.name,
    model: 'CUSTOM',
    description: workout.description || '',
    estimatedMinutes: Math.max(0, ...result.map((item) => Number(item.estimatedMinutes || 0))),
    scheduledTime: '',
    templateId: workout.template_id || null,
    notes: workout.notes || '',
    scheduledDays,
    createdAt: workout.created_at,
    prescriptions: result,
    exercises: allExercises,
    latestSession: latestSessions[0] || null,
    status: overallWorkoutStatus(result),
  }
}

export async function loadOwnedWorkout(pool, workoutId, trainerId) {
  const { rows } = await pool.query(
    `SELECT w.*, t.name AS trainer_name, t.avatar_url AS trainer_avatar_url,
            s.name AS student_name
     FROM atlas_workouts w
     JOIN atlas_users t ON t.id = w.trainer_id
     JOIN atlas_users s ON s.id = w.student_id
     WHERE w.id = $1 AND w.trainer_id = $2`,
    [workoutId, trainerId]
  )
  return rows[0] || null
}
