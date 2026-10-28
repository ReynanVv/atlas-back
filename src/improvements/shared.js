export function cleanText(value, label, required = false, max = 2000) {
  const text = value == null ? '' : String(value).trim()
  if (required && !text) throw new Error(`${label} é obrigatório.`)
  if (text.length > max) throw new Error(`${label} é muito longo.`)
  return text
}

export function workoutDays(value) {
  const days = [...new Set((Array.isArray(value) ? value : []).map(Number))].sort((a, b) => a - b)
  if (!days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error('Selecione pelo menos um dia válido da semana.')
  }
  return days
}

export function normalizeExercise(exercise = {}) {
  return {
    exerciseId: exercise.exerciseId || null,
    name: cleanText(exercise.name, 'Exercício', true, 120),
    sets: Math.max(1, Number.parseInt(exercise.sets, 10) || 1),
    reps: Math.max(1, Number.parseInt(exercise.reps, 10) || 1),
    suggestedWeight: Math.max(0, Number(exercise.suggestedWeight) || 0),
    restSeconds: Math.max(0, Number.parseInt(exercise.restSeconds, 10) || 0),
    notes: cleanText(exercise.notes, 'Observações do exercício', false, 1000),
    videoUrl: cleanText(exercise.videoUrl, 'Vídeo', false, 1800) || null,
  }
}

export function normalizePrescription(input = {}, index = 0) {
  const exercises = Array.isArray(input.exercises) ? input.exercises.map(normalizeExercise) : []
  if (!exercises.length) throw new Error(`Adicione pelo menos um exercício à prescrição ${index + 1}.`)
  return {
    id: input.id ? String(input.id) : null,
    name: cleanText(input.name, 'Nome da prescrição', true, 80),
    notes: cleanText(input.notes, 'Observações da prescrição', false, 1500),
    estimatedMinutes: Math.max(0, Math.min(600, Number.parseInt(input.estimatedMinutes, 10) || 0)),
    scheduledDays: workoutDays(input.scheduledDays),
    exercises,
  }
}

export function unionPrescriptionDays(prescriptions) {
  return [...new Set(prescriptions.flatMap((item) => item.scheduledDays || []))].sort((a, b) => a - b)
}

export function overallWorkoutStatus(prescriptions) {
  if (!prescriptions.length) return 'Pendente'
  if (prescriptions.every((item) => item.status === 'Realizado')) return 'Realizado'
  if (prescriptions.some((item) => item.status === 'Pendente')) return 'Pendente'
  if (prescriptions.some((item) => item.status === 'Não Realizado')) return 'Não Realizado'
  return 'Pendente'
}
