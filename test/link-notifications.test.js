import test from 'node:test'
import assert from 'node:assert/strict'
import { createTrainerStudentLink } from '../src/improvements/link-notifications.js'

test('createTrainerStudentLink notifies trainer only for a new relationship', async () => {
  const calls = []
  const db = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (sql.includes('INSERT INTO atlas_trainer_students')) {
        return { rowCount: 1, rows: [{ id: 'link-1' }] }
      }
      return { rowCount: 1, rows: [] }
    },
  }

  const result = await createTrainerStudentLink(db, {
    trainerId: 'trainer-1',
    studentId: 'student-1',
    studentName: 'Ana',
    source: 'public',
  })

  assert.equal(result.created, true)
  assert.equal(calls.length, 2)
  assert.match(calls[1].sql, /student_linked/)
  assert.equal(calls[1].params[2], 'Ana vinculou-se ao seu perfil público.')
})

test('createTrainerStudentLink does not notify when relationship already exists', async () => {
  const calls = []
  const db = {
    async query(sql, params) {
      calls.push({ sql, params })
      return { rowCount: 0, rows: [] }
    },
  }

  const result = await createTrainerStudentLink(db, {
    trainerId: 'trainer-1',
    studentId: 'student-1',
    studentName: 'Ana',
  })

  assert.equal(result.created, false)
  assert.equal(calls.length, 1)
})
