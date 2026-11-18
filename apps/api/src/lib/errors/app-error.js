import { ERROR_CATALOG } from '@alyora/shared';

/** @typedef {import('@alyora/shared/errors').ErrorCode} ErrorCode */
/** @typedef {import('@alyora/shared/schemas').ErrorDetails} ErrorDetails */

/**
 * Erreur attendue, levée volontairement par l'application. Son code, son statut HTTP et son
 * message sont envoyés tels quels au client : le message ne doit donc jamais contenir de
 * donnée interne. Toute autre erreur reçoit une réponse INTERNAL_ERROR générique.
 */
export class AppError extends Error {
  /**
   * @param {ErrorCode} code Un code du catalogue partagé.
   * @param {object} [options]
   * @param {string} [options.message] Message destiné aux développeurs, celui du catalogue
   *   par défaut.
   * @param {ErrorDetails} [options.details]
   * @param {unknown} [options.cause] Erreur d'origine : journalisée, jamais envoyée au client.
   */
  constructor(code, { message, details, cause } = {}) {
    const entry = ERROR_CATALOG[code];
    if (!entry) {
      throw new TypeError(`Unknown error code: ${String(code)}`);
    }
    super(message ?? entry.message, cause === undefined ? undefined : { cause });
    this.name = 'AppError';
    /** @readonly */
    this.code = code;
    /** @readonly */
    this.httpStatus = entry.httpStatus;
    /** @readonly */
    this.details = details;
  }
}

/**
 * @param {unknown} error
 * @returns {error is AppError}
 */
export function isAppError(error) {
  return error instanceof AppError;
}
