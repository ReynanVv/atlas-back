import test from 'node:test'
import assert from 'node:assert/strict'
import { mapWgerExercise } from '../src/improvements/external-exercises.js'
import { normalizePrescription, overallWorkoutStatus, unionPrescriptionDays } from '../src/improvements/shared.js'

test('normalizePrescription keeps arbitrary names and validates exercises', () => {
  const result = normalizePrescription({
    name: 'Mobilidade',
    scheduledDays: [6, 2],
    estimatedMinutes: 25,
    exercises: [{ name: 'Alongamento', sets: 2, reps: 10 }],
  })
  assert.equal(result.name, 'Mobilidade')
  assert.deepEqual(result.scheduledDays, [2, 6])
  assert.equal(result.exercises[0].name, 'Alongamento')
})

test('unionPrescriptionDays combines a free number of prescriptions', () => {
  assert.deepEqual(unionPrescriptionDays([
    { scheduledDays: [1, 3] },
    { scheduledDays: [2, 3, 5] },
  ]), [1, 2, 3, 5])
})

test('overallWorkoutStatus prioritizes pending work', () => {
  assert.equal(overallWorkoutStatus([{ status: 'Realizado' }, { status: 'Pendente' }]), 'Pendente')
  assert.equal(overallWorkoutStatus([{ status: 'Realizado' }, { status: 'Realizado' }]), 'Realizado')
})

test('mapWgerExercise prioritizes Brazilian Portuguese translation', () => {
  const item = mapWgerExercise({
    id: 10,
    translations: [
      { language: { code: 'en' }, name: 'Bench press', description: '<p>Press</p>' },
      { language: { code: 'pt-br' }, name: 'Supino reto', description: '<p>Empurre a barra</p>' },
    ],
    category: { name: 'Peito' },
    muscles: [{ name_en: 'Pectoralis major' }],
    images: [{ image: 'https://example.com/a.jpg' }],
    videos: [{ video: 'https://example.com/a.mp4' }],
  })
  assert.equal(item.name, 'Supino reto')
  assert.equal(item.description, 'Empurre a barra')
  assert.equal(item.videoUrl, 'https://example.com/a.mp4')
})
