export function workoutDays(value) {
  const days = [...new Set((Array.isArray(value) ? value : []).map(Number))].sort((a, b) => a - b)
  if (!days.length || days.some((item) => !Number.isInteger(item) || item < 0 || item > 6)) {
    throw new Error('Selecione pelo menos um dia válido da semana.')
  }
  return days
}

function startOfToday(date = new Date()) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

export function occurrenceDateForWorkout(workout, now = new Date()) {
  const days = Array.isArray(workout.scheduled_days)
    ? workout.scheduled_days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : []
  if (!days.length) return null

  const today = startOfToday(now)
  const todayDow = today.getDay()
  const pastOrToday = days.filter((day) => day <= todayDow)
  const targetDow = pastOrToday.length ? Math.max(...pastOrToday) : Math.max(...days)
  const delta = pastOrToday.length ? todayDow - targetDow : todayDow + 7 - targetDow
  const occurrence = new Date(today)
  occurrence.setDate(today.getDate() - delta)
  return occurrence
}

export function statusForWorkout(workout, latestSession, now = new Date()) {
  if (latestSession?.startedAt && !latestSession?.completedAt) return 'Pendente'

  const occurrence = occurrenceDateForWorkout(workout, now)
  if (!occurrence) return latestSession?.completedAt ? 'Realizado' : 'Pendente'

  const completedAt = latestSession?.completedAt ? new Date(latestSession.completedAt) : null
  if (completedAt && completedAt >= occurrence) return 'Realizado'

  const today = startOfToday(now)
  const days = Array.isArray(workout.scheduled_days) ? workout.scheduled_days.map(Number) : []
  if (days.includes(today.getDay())) return 'Pendente'
  return occurrence < today ? 'Não Realizado' : 'Pendente'
}

export function isWorkoutEditable(sessionCount) {
  return Number(sessionCount || 0) === 0
}
