import crypto from 'node:crypto'

export function normalizeTrainerReview(input = {}) {
  const rating = Number(input.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    const error = new Error('A avaliação deve ser de 1 a 5 estrelas.')
    error.statusCode = 400
    throw error
  }
  const comment = String(input.comment || '').trim()
  if (comment.length > 1000) {
    const error = new Error('O comentário deve ter no máximo 1000 caracteres.')
    error.statusCode = 400
    throw error
  }
  return { rating, comment }
}

async function reviewEligibility(pool, trainerId, studentId) {
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM atlas_workout_sessions s
       JOIN atlas_workouts w ON w.id = s.workout_id
       WHERE w.trainer_id = $1
         AND s.student_id = $2
         AND s.completed_at IS NOT NULL
     ) AS eligible`,
    [trainerId, studentId]
  )
  return Boolean(rows[0]?.eligible)
}

export function registerReviewRoutes({ app, pool, atlasRequireAuth, atlasRole }) {
  app.get('/atlas-api/trainers/:id/public-profile', atlasRequireAuth, atlasRole('student'), async (req, res, next) => {
    try {
      const { rows: trainerRows } = await pool.query(
        `SELECT u.id, u.name, u.email, u.avatar_url AS "avatarUrl",
                u.trainer_public AS "trainerPublic",
                COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0)::float8 AS "ratingAverage",
                COUNT(r.id)::int AS "ratingCount"
         FROM atlas_users u
         LEFT JOIN atlas_trainer_reviews r ON r.trainer_id = u.id
         WHERE u.id = $1
           AND u.trainer_public = TRUE
           AND (
             u.role = 'trainer'
             OR EXISTS (
               SELECT 1 FROM atlas_user_profiles p
               WHERE p.user_id = u.id AND p.profile = 'trainer'
             )
           )
         GROUP BY u.id`,
        [req.params.id]
      )
      const trainer = trainerRows[0]
      if (!trainer) return res.status(404).json({ error: 'Treinador público não encontrado.' })

      const { rows: reviews } = await pool.query(
        `SELECT r.id, r.rating, r.comment, r.created_at AS "createdAt",
                r.updated_at AS "updatedAt", u.name AS "studentName",
                u.avatar_url AS "studentAvatarUrl"
         FROM atlas_trainer_reviews r
         JOIN atlas_users u ON u.id = r.student_id
         WHERE r.trainer_id = $1
         ORDER BY r.updated_at DESC
         LIMIT 20`,
        [req.params.id]
      )

      const { rows: myRows } = await pool.query(
        `SELECT id, rating, comment, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM atlas_trainer_reviews
         WHERE trainer_id = $1 AND student_id = $2`,
        [req.params.id, req.atlasUser.id]
      )

      res.json({
        trainer,
        reviews,
        eligibleToReview: await reviewEligibility(pool, req.params.id, req.atlasUser.id),
        myReview: myRows[0] || null,
      })
    } catch (error) { next(error) }
  })

  app.put('/atlas-api/trainers/:id/review', atlasRequireAuth, atlasRole('student'), async (req, res, next) => {
    try {
      const review = normalizeTrainerReview(req.body)

      const trainer = await pool.query(
        `SELECT 1 FROM atlas_users u
         WHERE u.id = $1
           AND (
             u.role = 'trainer'
             OR EXISTS (
               SELECT 1 FROM atlas_user_profiles p
               WHERE p.user_id = u.id AND p.profile = 'trainer'
             )
           )`,
        [req.params.id]
      )
      if (!trainer.rowCount) return res.status(404).json({ error: 'Treinador não encontrado.' })

      const eligible = await reviewEligibility(pool, req.params.id, req.atlasUser.id)
      if (!eligible) {
        return res.status(403).json({
          error: 'Você poderá avaliar este professor após concluir pelo menos uma sessão prescrita por ele.',
        })
      }

      const { rows: previous } = await pool.query(
        'SELECT id FROM atlas_trainer_reviews WHERE trainer_id = $1 AND student_id = $2',
        [req.params.id, req.atlasUser.id]
      )
      const isNew = !previous[0]

      const { rows } = await pool.query(
        `INSERT INTO atlas_trainer_reviews
          (id, trainer_id, student_id, rating, comment)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (trainer_id, student_id)
         DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = NOW()
         RETURNING id, rating, comment, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [crypto.randomUUID(), req.params.id, req.atlasUser.id, review.rating, review.comment]
      )

      if (isNew) {
        await pool.query(
          `INSERT INTO atlas_notifications
            (id, user_id, type, title, body, reference_id, occurrence_key)
           VALUES ($1, $2, 'trainer_review_received', 'Nova avaliação recebida', $3, $4, $5)
           ON CONFLICT (user_id, type, reference_id, occurrence_key) DO NOTHING`,
          [
            crypto.randomUUID(),
            req.params.id,
            `${req.atlasUser.name} avaliou seu acompanhamento com ${review.rating} estrela${review.rating === 1 ? '' : 's'}.`,
            req.atlasUser.id,
            rows[0].id,
          ]
        )
      }

      const { rows: summaryRows } = await pool.query(
        `SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)::float8 AS "ratingAverage",
                COUNT(*)::int AS "ratingCount"
         FROM atlas_trainer_reviews
         WHERE trainer_id = $1`,
        [req.params.id]
      )

      res.json({ review: rows[0], ...summaryRows[0] })
    } catch (error) {
      if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message })
      next(error)
    }
  })
}
