import crypto from 'node:crypto'
import { cleanText } from './shared.js'
import { createTrainerStudentLink } from './link-notifications.js'

async function profilesFor(pool, userId, fallbackRole) {
  await pool.query(
    `INSERT INTO atlas_user_profiles (id, user_id, profile)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, profile) DO NOTHING`,
    [crypto.randomUUID(), userId, fallbackRole]
  )
  const { rows } = await pool.query(
    'SELECT profile FROM atlas_user_profiles WHERE user_id = $1 ORDER BY profile',
    [userId]
  )
  return rows.map((row) => row.profile)
}

export function registerProfileRoutes({ app, pool, atlasRequireAuth, atlasRole }) {
  app.get('/atlas-api/me', atlasRequireAuth, async (req, res, next) => {
    try {
      const profiles = await profilesFor(pool, req.atlasUser.id, req.atlasUser.role)
      const { rows } = await pool.query(
        `SELECT avatar_url AS "avatarUrl", trainer_public AS "trainerPublic"
         FROM atlas_users WHERE id = $1`,
        [req.atlasUser.id]
      )
      res.json({
        user: {
          ...req.atlasUser,
          avatarUrl: rows[0]?.avatarUrl || null,
          trainerPublic: Boolean(rows[0]?.trainerPublic),
          profiles,
        },
      })
    } catch (error) { next(error) }
  })

  app.patch('/atlas-api/me', atlasRequireAuth, async (req, res, next) => {
    try {
      const name = req.body?.name == null
        ? req.atlasUser.name
        : cleanText(req.body.name, 'Nome', true, 120)
      const avatarUrl = req.body?.avatarUrl === undefined
        ? undefined
        : cleanText(req.body.avatarUrl, 'Foto de perfil', false, 1600000) || null
      const trainerPublic = req.body?.trainerPublic === undefined
        ? undefined
        : Boolean(req.body.trainerPublic)

      const { rows: currentRows } = await pool.query(
        'SELECT avatar_url, trainer_public FROM atlas_users WHERE id = $1',
        [req.atlasUser.id]
      )
      const current = currentRows[0] || {}
      const { rows } = await pool.query(
        `UPDATE atlas_users
         SET name = $2, avatar_url = $3, trainer_public = $4
         WHERE id = $1
         RETURNING id, name, email, avatar_url AS "avatarUrl",
                   trainer_public AS "trainerPublic"`,
        [
          req.atlasUser.id,
          name,
          avatarUrl === undefined ? current.avatar_url : avatarUrl,
          trainerPublic === undefined ? current.trainer_public : trainerPublic,
        ]
      )
      const profiles = await profilesFor(pool, req.atlasUser.id, req.atlasUser.role)
      res.json({ user: { ...rows[0], role: req.atlasUser.role, profiles } })
    } catch (error) { next(error) }
  })

  app.get('/atlas-api/trainers/public', atlasRequireAuth, atlasRole('student'), async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT u.id, u.name, u.email, u.avatar_url AS "avatarUrl",
                EXISTS (
                  SELECT 1 FROM atlas_trainer_students ts
                  WHERE ts.trainer_id = u.id AND ts.student_id = $1
                ) AS linked
         FROM atlas_users u
         WHERE u.trainer_public = TRUE
           AND u.id <> $1
           AND (
             u.role = 'trainer'
             OR EXISTS (
               SELECT 1 FROM atlas_user_profiles p
               WHERE p.user_id = u.id AND p.profile = 'trainer'
             )
           )
         ORDER BY linked DESC, u.name`,
        [req.atlasUser.id]
      )
      res.json(rows)
    } catch (error) { next(error) }
  })

  app.post('/atlas-api/trainers/:id/link', atlasRequireAuth, atlasRole('student'), async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT u.id
         FROM atlas_users u
         WHERE u.id = $1 AND u.trainer_public = TRUE
           AND (
             u.role = 'trainer'
             OR EXISTS (
               SELECT 1 FROM atlas_user_profiles p
               WHERE p.user_id = u.id AND p.profile = 'trainer'
             )
           )`,
        [req.params.id]
      )
      if (!rows[0]) return res.status(404).json({ error: 'Treinador público não encontrado.' })
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const link = await createTrainerStudentLink(client, {
          trainerId: req.params.id,
          studentId: req.atlasUser.id,
          studentName: req.atlasUser.name,
          source: 'public',
        })
        await client.query('COMMIT')
        res.status(link.created ? 201 : 200).json({
          trainerId: req.params.id,
          linked: true,
          created: link.created,
        })
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    } catch (error) { next(error) }
  })

  app.post('/atlas-api/trainer/students/:id/remind-workout', atlasRequireAuth, atlasRole('trainer'), async (req, res, next) => {
    try {
      const linked = await pool.query(
        'SELECT 1 FROM atlas_trainer_students WHERE trainer_id = $1 AND student_id = $2',
        [req.atlasUser.id, req.params.id]
      )
      if (!linked.rowCount) return res.status(404).json({ error: 'Aluno não vinculado.' })

      const { rows } = await pool.query(
        `SELECT w.id, w.name
         FROM atlas_workouts w
         WHERE w.trainer_id = $1 AND w.student_id = $2
         ORDER BY w.created_at DESC
         LIMIT 1`,
        [req.atlasUser.id, req.params.id]
      )
      if (!rows[0]) return res.status(400).json({ error: 'Este aluno ainda não possui treino prescrito.' })

      const occurrenceKey = new Date().toISOString().slice(0, 10)
      const result = await pool.query(
        `INSERT INTO atlas_notifications
          (id, user_id, type, title, body, reference_id, occurrence_key)
         VALUES ($1, $2, 'workout_reminder', 'Treino pendente', $3, $4, $5)
         ON CONFLICT (user_id, type, reference_id, occurrence_key) DO NOTHING
         RETURNING id`,
        [crypto.randomUUID(), req.params.id, `Seu treinador lembrou você do treino ${rows[0].name}.`, rows[0].id, occurrenceKey]
      )
      res.json({ sent: Boolean(result.rowCount), workoutId: rows[0].id })
    } catch (error) { next(error) }
  })
}
