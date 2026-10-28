import crypto from 'node:crypto'

export async function createTrainerStudentLink(db, {
  trainerId,
  studentId,
  studentName,
  source = 'invite',
}) {
  const linkId = crypto.randomUUID()
  const result = await db.query(
    `INSERT INTO atlas_trainer_students (id, trainer_id, student_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (trainer_id, student_id) DO NOTHING
     RETURNING id`,
    [linkId, trainerId, studentId]
  )

  if (!result.rowCount) {
    return { created: false, linkId: null }
  }

  const safeName = String(studentName || 'Um novo aluno').trim() || 'Um novo aluno'
  const body = source === 'public'
    ? `${safeName} vinculou-se ao seu perfil público.`
    : `${safeName} aceitou seu convite e agora está vinculado a você.`

  await db.query(
    `INSERT INTO atlas_notifications
      (id, user_id, type, title, body, reference_id, occurrence_key)
     VALUES ($1, $2, 'student_linked', 'Novo aluno vinculado', $3, $4, $5)
     ON CONFLICT (user_id, type, reference_id, occurrence_key) DO NOTHING`,
    [crypto.randomUUID(), trainerId, body, studentId, result.rows[0].id]
  )

  return { created: true, linkId: result.rows[0].id }
}
