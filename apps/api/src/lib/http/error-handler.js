import { AppError, isAppError } from '../errors/app-error.js';

/**
 * Types d'erreur de body-parser et l'erreur à laquelle ils correspondent. L'erreur d'origine
 * n'est jamais journalisée ni renvoyée telle quelle : son message et sa propriété `body`
 * contiennent le corps brut de la requête.
 */
const BODY_PARSER_ERRORS = /** @type {const} */ ({
  'entity.parse.failed': { code: 'VALIDATION_ERROR', message: 'Malformed JSON body' },
  'entity.too.large': { code: 'PAYLOAD_TOO_LARGE', message: undefined },
  'encoding.unsupported': { code: 'VALIDATION_ERROR', message: 'Unsupported body encoding' },
  'charset.unsupported': { code: 'VALIDATION_ERROR', message: 'Unsupported body charset' },
  'request.aborted': { code: 'VALIDATION_ERROR', message: 'Request body aborted' },
  'request.size.invalid': { code: 'VALIDATION_ERROR', message: 'Invalid body size' },
  'stream.encoding.set': { code: 'VALIDATION_ERROR', message: 'Unreadable request body' },
  'stream.not.readable': { code: 'VALIDATION_ERROR', message: 'Unreadable request body' },
});

/**
 * Convertit n'importe quelle valeur levée en AppError. Une erreur inconnue devient un
 * INTERNAL_ERROR générique, qui garde l'original en `cause`, pour les logs seulement.
 *
 * @param {unknown} error
 * @returns {AppError}
 */
export function toAppError(error) {
  if (isAppError(error)) {
    return error;
  }
  const bodyErrorType = bodyParserErrorType(error);
  if (bodyErrorType) {
    const { code, message } = BODY_PARSER_ERRORS[bodyErrorType];
    return new AppError(code, { message });
  }
  return new AppError('INTERNAL_ERROR', { cause: error });
}

/**
 * Middleware d'erreur final. Répond toujours { code, message, details }, jamais avec une pile
 * d'appels, quel que soit l'environnement : la pile reste dans les logs, retrouvable grâce à
 * X-Request-Id.
 *
 * @param {object} deps
 * @param {import('pino').Logger} deps.logger
 * @returns {import('express').ErrorRequestHandler}
 */
export function errorHandler({ logger }) {
  return (error, req, res, next) => {
    if (res.headersSent) {
      // Trop tard pour répondre : on laisse Express couper la connexion.
      next(error);
      return;
    }
    const appError = toAppError(error);
    const logFields = { correlationId: req.id, code: appError.code, status: appError.httpStatus };
    if (appError.httpStatus >= 500) {
      logger.error({ ...logFields, err: appError.cause ?? appError }, 'Request failed');
    } else {
      const bodyErrorType = bodyParserErrorType(error);
      logger.warn(bodyErrorType ? { ...logFields, bodyErrorType } : logFields, appError.message);
    }
    res.status(appError.httpStatus).json(toErrorBody(appError));
  };
}

/**
 * Corps de la réponse d'erreur. `details` est toujours présent, vide quand l'erreur n'en a
 * pas : le client lit toujours un objet.
 *
 * @param {AppError} appError
 * @returns {import('@alyora/shared/schemas').ErrorResponse}
 */
export function toErrorBody(appError) {
  return { code: appError.code, message: appError.message, details: appError.details ?? {} };
}

/**
 * @param {unknown} error
 * @returns {keyof typeof BODY_PARSER_ERRORS | undefined}
 */
function bodyParserErrorType(error) {
  if (error instanceof Error && 'type' in error && typeof error.type === 'string') {
    return Object.hasOwn(BODY_PARSER_ERRORS, error.type)
      ? /** @type {keyof typeof BODY_PARSER_ERRORS} */ (error.type)
      : undefined;
  }
  return undefined;
}
