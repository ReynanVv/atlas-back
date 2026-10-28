function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()
}

function languageCode(translation) {
  const raw = translation?.language
  if (typeof raw === 'string') return raw.toLowerCase()
  return String(
    raw?.short_name || raw?.code || raw?.language_code ||
    translation?.language_code || translation?.languageCode || ''
  ).toLowerCase()
}

function chooseTranslation(item) {
  const translations = Array.isArray(item?.translations) ? item.translations : []
  return translations.find((item) => ['pt-br', 'pt_br'].includes(languageCode(item)))
    || translations.find((item) => languageCode(item) === 'pt')
    || translations.find((item) => String(item?.name || '').trim())
    || {}
}

export function mapWgerExercise(item) {
  const translation = chooseTranslation(item)
  const muscles = [
    ...(Array.isArray(item?.muscles) ? item.muscles : []),
    ...(Array.isArray(item?.muscles_secondary) ? item.muscles_secondary : []),
  ].map((muscle) => muscle?.name_en || muscle?.name || '').filter(Boolean)

  const videos = Array.isArray(item?.videos) ? item.videos : []
  const images = Array.isArray(item?.images) ? item.images : []
  const videoUrl = videos[0]?.video || videos[0]?.url || ''
  const imageUrl = images[0]?.image || images[0]?.url || images[0]?.thumbnails?.medium || ''

  return {
    id: `wger:${item?.id}`,
    source: 'wger',
    externalId: String(item?.id || ''),
    name: String(translation?.name || '').trim(),
    description: stripHtml(translation?.description || ''),
    category: item?.category?.name || '',
    muscleGroups: [...new Set(muscles)],
    videoUrl,
    imageUrl,
    attribution: item?.license_author || translation?.license_author || 'wger',
  }
}

export async function fetchWgerExercises(search = '', limit = 40) {
  const params = new URLSearchParams({
    limit: String(Math.max(1, Math.min(80, Number(limit) || 40))),
    language__code: 'pt-br',
  })
  if (String(search || '').trim()) params.set('search', String(search).trim())

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`https://wger.de/api/v2/exerciseinfo/?${params}`, {
      headers: { 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`wger respondeu ${response.status}`)
    const payload = await response.json()
    return (Array.isArray(payload?.results) ? payload.results : [])
      .map(mapWgerExercise)
      .filter((item) => item.name)
  } finally {
    clearTimeout(timeout)
  }
}

export function registerExternalExerciseRoutes({ app, atlasRequireAuth, atlasRole }) {
  app.get('/atlas-api/exercises/external', atlasRequireAuth, atlasRole('trainer'), async (req, res) => {
    try {
      const items = await fetchWgerExercises(req.query.search, req.query.limit)
      res.json({ source: 'wger', language: 'pt-BR', items })
    } catch (error) {
      res.status(502).json({ error: 'Não foi possível consultar a biblioteca externa agora.' })
    }
  })
}
