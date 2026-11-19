import { CLIENT_ERROR_CODES, errorResponseSchema } from '@alyora/shared';

/** @typedef {import('@alyora/shared/errors').ErrorCode} ErrorCode */
/** @typedef {import('@alyora/shared/errors').ClientErrorCode} ClientErrorCode */
/** @typedef {import('@alyora/shared/schemas').ErrorDetails} ErrorDetails */

/** En-tête de corrélation renvoyé par l'API, repris dans tous ses logs. */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Erreur applicative typée : toute requête qui échoue la produit, quelle que soit la cause.
 * L'interface traduit `code` avec i18next ; `message` (en anglais) n'est jamais affiché.
 */
export class ApiError extends Error {
  /**
   * @param {object} init
   * @param {ErrorCode | ClientErrorCode} init.code
   * @param {number} init.status Statut HTTP, 0 quand la requête n'a pas abouti.
   * @param {string} init.message Message pour les développeurs.
   * @param {ErrorDetails} [init.details]
   * @param {string} [init.requestId] Identifiant de corrélation de l'API, pour le support.
   * @param {unknown} [init.cause]
   */
  constructor({ code, status, message, details = {}, requestId, cause }) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ApiError';
    /** @readonly */
    this.code = code;
    /** @readonly */
    this.status = status;
    /** @readonly */
    this.details = details;
    /** @readonly */
    this.requestId = requestId;
  }
}

/**
 * @param {unknown} error
 * @returns {error is ApiError}
 */
export function isApiError(error) {
  return error instanceof ApiError;
}

/**
 * Traduit une réponse d'erreur de l'API. Un corps au format { code, message, details } devient
 * une ApiError de ce code ; tout autre corps (page HTML d'un proxy, JSON inattendu, rien)
 * devient INVALID_RESPONSE.
 *
 * @param {Response} response
 * @returns {Promise<ApiError>}
 */
export async function toApiError(response) {
  const requestId = response.headers.get(REQUEST_ID_HEADER) ?? undefined;
  const parsed = errorResponseSchema.safeParse(await readJson(response));
  if (parsed.success) {
    return new ApiError({ ...parsed.data, status: response.status, requestId });
  }
  return invalidResponseError(response, requestId);
}

/**
 * @param {Response} response
 * @param {string} [requestId]
 * @returns {ApiError}
 */
export function invalidResponseError(response, requestId) {
  return new ApiError({
    code: CLIENT_ERROR_CODES.INVALID_RESPONSE,
    status: response.status,
    message: `Unexpected response from the API (HTTP ${response.status})`,
    requestId: requestId ?? response.headers.get(REQUEST_ID_HEADER) ?? undefined,
  });
}

/**
 * @param {unknown} cause
 * @returns {ApiError}
 */
export function networkError(cause) {
  return new ApiError({
    code: CLIENT_ERROR_CODES.NETWORK_ERROR,
    status: 0,
    message: 'The request did not reach the API',
    cause,
  });
}

/**
 * @param {Response} response
 * @returns {Promise<unknown>} Le corps JSON, ou undefined s'il n'y en a pas ou s'il est illisible.
 */
export async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
