export function isProductionRuntime(env = process.env) {
  return env.NODE_ENV === 'production' || env.RENDER === 'true'
}

export function isDemoEnabled(env = process.env) {
  return env.ATLAS_DEMO_ENABLED === 'true' && !isProductionRuntime(env)
}

export function requireSessionSecret(value, env = process.env) {
  const secret = String(value || '')
  if (isProductionRuntime(env) && secret.length < 48) {
    throw new Error('SESSION_SECRET precisa ter pelo menos 48 caracteres em produção.')
  }
  return secret || 'dev-secret-change-me'
}

export function atlasAllowedOrigins(env = process.env) {
  const origins = new Set([
    'https://atlas-front-kl8a.onrender.com',
    'https://atlas-live-i72f.onrender.com',
  ])

  if (!isProductionRuntime(env)) {
    origins.add('http://localhost:5173')
    origins.add('http://127.0.0.1:5173')
  }

  for (const origin of String(env.ATLAS_FRONT_ORIGINS || '').split(',')) {
    const normalized = origin.trim()
    if (normalized) origins.add(normalized)
  }

  return origins
}
