import { refreshSessionResponseSchema } from '@alyora/shared';
import { useSessionStore } from '../session/session-store.js';
import {
  invalidResponseError,
  isDefinitiveRejection,
  networkError,
  readJson,
  toApiError,
} from './api-error.js';
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
 * @property {() => void} onSessionExpired Appelée une fois par refresh que l'API refuse
 *   définitivement (voir isDefinitiveRejection).
 */

/**
 * Client HTTP de l'application : le seul code qui appelle fetch.
 * - cookies inclus (refresh token HttpOnly), access token en en-tête Authorization ;
 * - toute erreur devient une ApiError typée (voir api-error.js) ;
 * - sur un 401, un seul refresh est lancé, quel que soit le nombre de requêtes en vol : les
 *   autres l'attendent, puis chacune est rejouée une fois. Une requête qui part pendant un
 *   refresh attend sa fin avant d'être envoyée. Un 401 qui arrive après la fin d'un refresh
 *   n'en relance pas un autre : le résultat de ce refresh vaut pour lui ;
 * - seul un refus définitif du refresh met fin à la session. Une panne passagère (réseau,
 *   erreur du serveur, 429) la garde : la requête échoue avec l'erreur du refresh, que
 *   l'appelant peut réessayer.
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

  /** @returns {Promise<string>} Le nouvel access token. */
  async function requestAccessToken() {
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
    return parsed.data.accessToken;
  }

  /**
   * Nombre de refresh terminés, réussis ou non : une requête sait ainsi si l'un d'eux s'est
   * terminé pendant qu'elle était en vol.
   */
  let completedRefreshes = 0;
  /** Erreur du dernier refresh terminé, null s'il a réussi. @type {unknown} */
  let lastRefreshError = null;

  const refreshSession = createSingleFlight(async () => {
    try {
      const accessToken = await requestAccessToken();
      lastRefreshError = null;
      setAccessToken(accessToken);
      return accessToken;
    } catch (error) {
      lastRefreshError = error;
      // Ici, et pas dans chaque requête qui attendait : la session prend fin une seule fois.
      if (isDefinitiveRejection(error)) {
        onSessionExpired();
      }
      throw error;
    } finally {
      completedRefreshes += 1;
    }
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
   * État de la session au moment où une requête part.
   *
   * @typedef {object} SentWith
   * @property {string | null} accessToken Jeton envoyé.
   * @property {number} completedRefreshes Refresh terminés à ce moment-là.
   */

  /**
   * Obtient un jeton valide après un 401 :
   * - si un autre appel a déjà renouvelé la session entre-temps, son jeton sert tel quel ;
   * - si un refresh s'est terminé pendant le vol de la requête sans laisser de jeton, son
   *   échec vaut pour elle : pas de second refresh ;
   * - sinon, un refresh est lancé, ou celui qui est en vol est rejoint.
   * Après un refus définitif (ou une session fermée entre-temps), la requête échoue avec son
   * propre 401 ; après une panne passagère, avec l'erreur du refresh.
   *
   * @param {SentWith} sent
   * @param {Response} rejectedResponse
   * @returns {Promise<string>}
   */
  async function renewAfter(sent, rejectedResponse) {
    const current = getAccessToken();
    if (current && current !== sent.accessToken) {
      return current;
    }
    let failure = lastRefreshError;
    if (completedRefreshes === sent.completedRefreshes) {
      try {
        return await refreshSession();
      } catch (refreshError) {
        failure = refreshError;
      }
    }
    if (failure !== null && !isDefinitiveRejection(failure)) {
      throw failure;
    }
    throw await toApiError(rejectedResponse);
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
    /** @type {SentWith} */
    const sent = { accessToken: getAccessToken(), completedRefreshes };
    let response = await sendAuthenticated(path, options, sent.accessToken);

    if (response.status === 401) {
      const renewedToken = await renewAfter(sent, response);
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
