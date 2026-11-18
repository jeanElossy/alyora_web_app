// Point d'entrée bibliothèque de @alyora/api, utilisé par @alyora/worker.
// Il doit rester sans effet de bord : l'importer ne démarre jamais de serveur, n'ouvre aucune
// connexion et ne programme aucun minuteur (vérifié par index.test.js). Le point d'entrée du
// processus est src/server.js.
export {
  getCorrelationId,
  getRequestContext,
  runWithContext,
} from './lib/context/request-context.js';
export { AppError, isAppError } from './lib/errors/app-error.js';
export { createLogger } from './lib/logger/create-logger.js';
