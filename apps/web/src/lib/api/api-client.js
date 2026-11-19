import { refreshSessionResponseSchema } from '@alyora/shared';
import { useSessionStore } from '../session/session-store.js';
import { ApiError, invalidResponseError, networkError, readJson, toApiError } from './api-error.js';
import { createSingleFlight } from './refresh-queue.js';

/** Route de rafraîchissement de session (contrat provisoire, voir session.schema.js). */
export const REFRESH_PATH = '/auth/refresh';

/** Base de l'API quand VITE_API_BASE_URL est absente : la même origine que l'application. */
export const DEFAULT_API_BASE_URL = '/api/v1';

/**
 * @typedef {object} RequestOptions
 * @property {'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'} [method]
 * @property {unknown} [body] Envoyé en JSON.
 * @property {Record<string, string | number | boolean | undefined>} [query]
 * @property {Record<string, string>} [headers]
 * @property {AbortSignal} [signal] Fourni par TanStack Query pour annuler une requête.
 */

/**
 * @typedef {object} ApiClientDependencies
 * @property {string} baseUrl Préfixe de version compris, sans barre finale.
 * @property {typeof fetch} [fetchImpl]
 * @property {() => string | null} getAccessToken
 * @property {(accessToken: string) => void} setAccessToken
 * @property {() => void} onSessionExpired Appelée quand le refresh est refusé par l'API.
 */

/**
 * Client HTTP de l'application : le seul code qui appelle fetch.
 * - cookies inclus (refresh token HttpOnly), access token en en-tête Authorization ;
 * - toute erreur devient une ApiError typée (voir api-error.js) ;
 * - sur un 401, un seul refresh est lancé, quel que soit le nombre de requêtes en vol : les
 *   autres l'attendent, puis chacune est rejouée une fois. Une requête qui part pendant un
 *   refresh attend sa fin avant d'être envoyée.
 *
 * @param {ApiClientDependencies} deps
 */
export function createApiClient({
  baseUrl,
  fetchImpl = (input, init) => globalThis.fetch(input, init),
  getAccessToken,
  setAccessToken,
  onSessionExpired,
}) {
  /**
   * @param {string} path
   * @param {RequestOptions['query']} [query]
   */
  function urlFor(path, query) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) {
        search.set(key, String(value));
      }
    }
    const queryString = search.toString();
    return `${baseUrl}${path}${queryString ? `?${queryString}` : ''}`;
  }

  /**
   * @param {string} url
   * @param {RequestInit} init
   * @returns {Promise<Response>}
   */
  async function send(url, init) {
    try {
      return await fetchImpl(url, { credentials: 'include', ...init });
    } catch (error) {
      // Une annulation n'est pas une erreur réseau : TanStack Query la reconnaît telle quelle.
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      throw networkError(error);
    }
  }

  const refreshSession = createSingleFlight(async () => {
    const response = await send(urlFor(REFRESH_PATH), {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw await toApiError(response);
    }
    const parsed = refreshSessionResponseSchema.safeParse(await readJson(response));
    if (!parsed.success) {
      throw invalidResponseError(response);
    }
    setAccessToken(parsed.data.accessToken);
    return parsed.data.accessToken;
  });

  /**
   * @param {string} path
   * @param {RequestOptions} options
   * @param {string | null} accessToken
   */
  function sendAuthenticated(path, { method = 'GET', body, query, headers, signal }, accessToken) {
    /** @type {Record<string, string>} */
    const allHeaders = { Accept: 'application/json', ...headers };
    if (body !== undefined) {
      allHeaders['Content-Type'] = 'application/json';
    }
    if (accessToken) {
      allHeaders.Authorization = `Bearer ${accessToken}`;
    }
    return send(urlFor(path, query), {
      method,
      headers: allHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  }

  /**
   * Obtient un jeton valide après un 401 reçu avec `rejectedToken`. Si un autre appel a déjà
   * renouvelé la session entre-temps, son jeton sert tel quel : pas de second refresh.
   *
   * @param {string | null} rejectedToken
   * @param {Response} rejectedResponse
   * @returns {Promise<string>}
   */
  async function renewAfter(rejectedToken, rejectedResponse) {
    const current = getAccessToken();
    if (current && current !== rejectedToken) {
      return current;
    }
    try {
      return await refreshSession();
    } catch (refreshError) {
      // Un refresh refusé par l'API met fin à la session ; une panne réseau, non.
      if (refreshError instanceof ApiError && refreshError.status === 0) {
        throw refreshError;
      }
      onSessionExpired();
      throw await toApiError(rejectedResponse);
    }
  }

  /**
   * Appelle l'API et renvoie le corps JSON de la réponse (undefined pour un 204).
   *
   * @param {string} path Chemin relatif à la base, ex. "/ping".
   * @param {RequestOptions} [options]
   * @returns {Promise<unknown>}
   * @throws {ApiError}
   */
  async function request(path, options = {}) {
    await refreshSession.settled();
    const accessToken = getAccessToken();
    let response = await sendAuthenticated(path, options, accessToken);

    if (response.status === 401) {
      const renewedToken = await renewAfter(accessToken, response);
      response = await sendAuthenticated(path, options, renewedToken);
    }

    if (!response.ok) {
      throw await toApiError(response);
    }
    if (response.status === 204) {
      return undefined;
    }
    const data = await readJson(response);
    if (data === undefined) {
      throw invalidResponseError(response);
    }
    return data;
  }

  return { request, refreshSession };
}

/** @typedef {ReturnType<typeof createApiClient>} ApiClient */

/**
 * Valide VITE_API_BASE_URL : une URL http(s) absolue ou un chemin absolu, sans barre finale.
 * Absente, l'API est cherchée sur la même origine (/api/v1).
 *
 * @param {string | undefined} value
 * @returns {string}
 * @throws {Error} Au démarrage, si la valeur est invalide.
 */
export function resolveApiBaseUrl(value) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_API_BASE_URL;
  }
  const isPath = trimmed.startsWith('/') && !trimmed.startsWith('//');
  const isHttpUrl = /^https?:\/\/[^/\s]+(\/\S*)?$/.test(trimmed);
  if ((!isPath && !isHttpUrl) || trimmed.endsWith('/')) {
    throw new Error(
      'VITE_API_BASE_URL must be an http(s) URL or an absolute path, without trailing slash',
    );
  }
  return trimmed;
}

/** Client de l'application, branché sur la session en mémoire. */
export const apiClient = createApiClient({
  baseUrl: resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  getAccessToken: () => useSessionStore.getState().accessToken,
  setAccessToken: (accessToken) => useSessionStore.getState().setAccessToken(accessToken),
  onSessionExpired: () => useSessionStore.getState().clear(),
});
