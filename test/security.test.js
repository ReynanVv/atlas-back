import test from 'node:test'
import assert from 'node:assert/strict'
import {
  atlasAllowedOrigins,
  isDemoEnabled,
  isProductionRuntime,
  requireSessionSecret,
} from '../src/security.js'

test('Render is treated as production even when NODE_ENV is absent', () => {
  assert.equal(isProductionRuntime({ RENDER: 'true' }), true)
})

test('demo cannot be enabled on Render or NODE_ENV production', () => {
  assert.equal(isDemoEnabled({ ATLAS_DEMO_ENABLED: 'true', RENDER: 'true' }), false)
  assert.equal(isDemoEnabled({ ATLAS_DEMO_ENABLED: 'true', NODE_ENV: 'production' }), false)
  assert.equal(isDemoEnabled({ ATLAS_DEMO_ENABLED: 'true', NODE_ENV: 'development' }), true)
})

test('production requires a strong session secret', () => {
  assert.throws(
    () => requireSessionSecret('short', { NODE_ENV: 'production' }),
    /48 caracteres/
  )
  assert.equal(
    requireSessionSecret('x'.repeat(48), { NODE_ENV: 'production' }),
    'x'.repeat(48)
  )
})

test('localhost CORS origins are excluded in production', () => {
  const production = atlasAllowedOrigins({ NODE_ENV: 'production' })
  assert.equal(production.has('http://localhost:5173'), false)
  assert.equal(production.has('https://atlas-front-kl8a.onrender.com'), true)

  const development = atlasAllowedOrigins({ NODE_ENV: 'development' })
  assert.equal(development.has('http://localhost:5173'), true)
})
