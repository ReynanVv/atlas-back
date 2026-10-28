import test from 'node:test'
import assert from 'node:assert/strict'
import { occurrenceDateForWorkout, statusForWorkout, workoutDays } from '../src/domain/workouts.js'

test('workoutDays normalizes duplicates and sorts days', () => {
  assert.deepEqual(workoutDays([3, 1, 3, 5]), [1, 3, 5])
})

test('workoutDays rejects empty or invalid schedules', () => {
  assert.throws(() => workoutDays([]), /dia válido/)
  assert.throws(() => workoutDays([7]), /dia válido/)
})

test('occurrenceDateForWorkout finds the latest scheduled occurrence', () => {
  const monday = new Date(2026, 9, 26, 12, 0, 0)
  const occurrence = occurrenceDateForWorkout({ scheduled_days: [0, 3] }, monday)
  assert.equal(occurrence.getDay(), 0)
  assert.equal(occurrence.getDate(), 25)
})

test('statusForWorkout is pending on a scheduled day', () => {
  const monday = new Date(2026, 9, 26, 12, 0, 0)
  assert.equal(statusForWorkout({ scheduled_days: [1] }, null, monday), 'Pendente')
})

test('statusForWorkout marks a missed occurrence as not completed', () => {
  const monday = new Date(2026, 9, 26, 12, 0, 0)
  assert.equal(statusForWorkout({ scheduled_days: [0] }, null, monday), 'Não Realizado')
})

test('statusForWorkout marks a completed occurrence as completed', () => {
  const monday = new Date(2026, 9, 26, 12, 0, 0)
  const session = { completedAt: new Date(2026, 9, 26, 13, 0, 0).toISOString() }
  assert.equal(statusForWorkout({ scheduled_days: [1] }, session, monday), 'Realizado')
})

test('statusForWorkout keeps an active session pending', () => {
  const monday = new Date(2026, 9, 26, 12, 0, 0)
  const session = { startedAt: new Date(2026, 9, 26, 11, 0, 0).toISOString(), completedAt: null }
  assert.equal(statusForWorkout({ scheduled_days: [1] }, session, monday), 'Pendente')
})
