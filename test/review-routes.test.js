import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTrainerReview } from '../src/improvements/review-routes.js'

test('normalizeTrainerReview accepts 1 to 5 stars and trims comment', () => {
  assert.deepEqual(normalizeTrainerReview({ rating: 5, comment: '  Excelente  ' }), {
    rating: 5,
    comment: 'Excelente',
  })
})

test('normalizeTrainerReview rejects invalid rating', () => {
  assert.throws(() => normalizeTrainerReview({ rating: 0 }), /1 a 5/)
  assert.throws(() => normalizeTrainerReview({ rating: 6 }), /1 a 5/)
  assert.throws(() => normalizeTrainerReview({ rating: 4.5 }), /1 a 5/)
})

test('normalizeTrainerReview limits comments', () => {
  assert.throws(() => normalizeTrainerReview({ rating: 4, comment: 'a'.repeat(1001) }), /1000/)
})
