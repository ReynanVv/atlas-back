import crypto from 'node:crypto'
import { createTrainerStudentLink } from './link-notifications.js'

function normalizeRequestMessage(value) {
  const message = String(value || '').trim()
  if (message.length > 600) {
    const error = new Error('A mensagem deve ter no máximo 600 caracteres.')
    error.statusCode = 400
    throw error
  }
  return message
}

async function notify(db, { userId, type, title, body, referenceId, occurrenceKey }) {
  await db.query(
    `INSERT INTO atlas_notifications
      (id, user_id, type, title, body, reference_id, occurrence_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, type, reference_id, occurrence_key) DO NOTHING`,
    [crypto.randomUUID(), userId, type, title, body, referenceId, occurrenceKey]
  )
}

export function registerLinkRequestRoutes({ app, pool, atlasRequireAuth, atlasRole }) {
  app.post('/atlas-api/trainers/:id/request', atlasRequireAuth, atlasRole('student'), async (req, res, next) => {
    const client = await pool.connect()
    try {
      const message = normalizeRequestMessage(req.body?.message)
      await client.query('BEGIN')

      const { rows: trainers } = await client.query(
        `SELECT u.id, u.name
         FROM atlas_users u
         WHERE u.id = $1
           AND u.trainer_public = TRUE
           AND (
             u.role = 'trainer'
             OR EXISTS (
               SELECT 1 FROM atlas_user_profiles p
               WHERE p.user_id = u.id AND p.profile = 'trainer'
             )
           )`,
        [req.params.id]
      )
      const trainer = trainers[0]
      if (!trainer) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Treinador público não encontrado.' })
      }

      const linked = await client.query(
        'SELECT 1 FROM atlas_trainer_students WHERE trainer_id = $1 AND student_id = $2',
        [trainer.id, req.atlasUser.id]
      )
      if (linked.rowCount) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'Você já está vinculado a este treinador.' })
      }

      const requestId = crypto.randomUUID()
      const { rows } = await client.query(
        `INSERT INTO atlas_trainer_link_requests
          (id, trainer_id, student_id, message, status)
         VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (trainer_id, student_id) WHERE status = 'pending'
         DO NOTHING
         RETURNING id, message, status, created_at AS "createdAt"`,
        [requestId, trainer.id, req.atlasUser.id, message]
      )

      if (!rows[0]) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'Você já possui uma solicitação pendente para este treinador.' })
      }

      const notificationBody = message
        ? `${req.atlasUser.name} quer se vincular a você: “${message}”`
        : `${req.atlasUser.name} quer se vincular a você.`

      await notify(client, {
        userId: trainer.id,
        type: 'student_link_request',
        title: 'Nova solicitação de vínculo',
        body: notificationBody,
        referenceId: requestId,
        occurrenceKey: requestId,
      })

      await client.query('COMMIT')
      res.status(201).json(rows[0])
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message })
      next(error)
    } finally {
      client.release()
    }
  })

  app.get('/atlas-api/trainer/link-requests', atlasRequireAuth, atlasRole('trainer'), async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT r.id, r.student_id AS "studentId", r.message, r.status,
                r.created_at AS "createdAt", u.name AS "studentName",
                u.email AS "studentEmail", u.avatar_url AS "studentAvatarUrl"
         FROM atlas_trainer_link_requests r
         JOIN atlas_users u ON u.id = r.student_id
         WHERE r.trainer_id = $1 AND r.status = 'pending'
         ORDER BY r.created_at ASC`,
        [req.atlasUser.id]
      )
      res.json(rows)
    } catch (error) { next(error) }
  })

  app.post('/atlas-api/trainer/link-requests/:id/accept', atlasRequireAuth, atlasRole('trainer'), async (req, res, next) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT r.*, u.name AS student_name
         FROM atlas_trainer_link_requests r
         JOIN atlas_users u ON u.id = r.student_id
         WHERE r.id = $1 AND r.trainer_id = $2 AND r.status = 'pending'
         FOR UPDATE`,
        [req.params.id, req.atlasUser.id]
      )
      const request = rows[0]
      if (!request) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Solicitação pendente não encontrada.' })
      }

      await createTrainerStudentLink(client, {
        trainerId: req.atlasUser.id,
        studentId: request.student_id,
        studentName: request.student_name,
        source: 'request',
        notifyTrainer: false,
      })

      await client.query(
        `UPDATE atlas_trainer_link_requests
         SET status = 'accepted', responded_at = NOW()
         WHERE id = $1`,
        [request.id]
      )

      await notify(client, {
        userId: request.student_id,
        type: 'trainer_request_accepted',
        title: 'Solicitação aceita',
        body: `${req.atlasUser.name} aceitou sua solicitação de vínculo.`,
        referenceId: req.atlasUser.id,
        occurrenceKey: request.id,
      })

      await client.query('COMMIT')
      res.json({ id: request.id, accepted: true, studentId: request.student_id })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      next(error)
    } finally {
      client.release()
    }
  })

  app.post('/atlas-api/trainer/link-requests/:id/reject', atlasRequireAuth, atlasRole('trainer'), async (req, res, next) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `UPDATE atlas_trainer_link_requests
         SET status = 'rejected', responded_at = NOW()
         WHERE id = $1 AND trainer_id = $2 AND status = 'pending'
         RETURNING student_id`,
        [req.params.id, req.atlasUser.id]
      )
      if (!rows[0]) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Solicitação pendente não encontrada.' })
      }

      await notify(client, {
        userId: rows[0].student_id,
        type: 'trainer_request_rejected',
        title: 'Solicitação recusada',
        body: `${req.atlasUser.name} não aceitou sua solicitação de vínculo.`,
        referenceId: req.atlasUser.id,
        occurrenceKey: req.params.id,
      })

      await client.query('COMMIT')
      res.json({ id: req.params.id, rejected: true })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      next(error)
    } finally {
      client.release()
    }
  })
}

export { normalizeRequestMessage }
