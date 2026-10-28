import { ensureAtlasImprovementsSchema } from './schema.js'
import { registerExternalExerciseRoutes } from './external-exercises.js'
import { registerProfileRoutes } from './profile-routes.js'
import { registerSessionRoutes } from './session-routes.js'
import { registerTemplateRoutes } from './template-routes.js'
import { registerWorkoutCopyRoutes } from './workout-copy-routes.js'
import { registerWorkoutRoutes } from './workout-routes.js'

export { ensureAtlasImprovementsSchema }

export function registerAtlasImprovementRoutes(deps) {
  registerProfileRoutes(deps)
  registerExternalExerciseRoutes(deps)
  registerTemplateRoutes(deps)
  registerWorkoutRoutes(deps)
  registerWorkoutCopyRoutes(deps)
  registerSessionRoutes(deps)
}
