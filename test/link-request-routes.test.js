import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRequestMessage } from '../src/improvements/link-request-routes.js'

test('normalizeRequestMessage keeps an optional trimmed message', () => {
  assert.equal(normalizeRequestMessage('  Quero treinar com você  '), 'Quero treinar com você')
  assert.equal(normalizeRequestMessage(''), '')
  assert.equal(normalizeRequestMessage(null), '')
})

test('normalizeRequestMessage rejects messages over 600 chars', () => {
  assert.throws(() => normalizeRequestMessage('a'.repeat(601)), /600 caracteres/)
})
