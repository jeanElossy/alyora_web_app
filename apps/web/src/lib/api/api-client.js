import { CSRF_HEADER, csrfTokenResponseSchema, refreshSessionResponseSchema } from '@alyora/shared';
import { useSessionStore } from '../session/session-store.js';
import { resolveApiBaseUrl } from './api-base-url.js';
import {
  invalidResponseError,
  isDefinitiveRejection,
  networkError,
  readJson,
  toApiError,
} from './api-error.js';
import { withCrossTabLock } from './cross-tab-lock.js';
import { createCsrfToken } from './csrf-token.js';
import { createSingleFlight } from './refresh-queue.js';

/** Route de rafraîchissement de session. */
export const REFRESH_PATH = '/auth/refresh';

/** Route qui délivre le jeton CSRF. */
export const CSRF_PATH = '/auth/csrf';

/** Verrou partagé par les onglets autour du refresh (voir cross-tab-lock.js). */
export const REFRESH_LOCK = 'alyora-session-refresh';

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
 * @property {import('./cross-tab-lock.js').LockManagerLike} [locks] Web Locks (tests).
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
 *   l'appelant peut réessayer ;
 * - seul un 401 UNAUTHENTICATED (access token absent ou expiré) déclenche un refresh. Des
 *   identifiants faux, un code 2FA faux ou une réauthentification demandée sont la réponse
 *   elle-même, renvoyée telle quelle ;
 * - toute requête qui modifie l'état, refresh compris, porte le jeton CSRF ; refusé (cookie
 *   expiré), il est redemandé une fois et la requête rejouée ;
 * - le refresh se fait sous un verrou partagé par les onglets : deux onglets ne présentent
 *   jamais ensemble le même refresh token (l'API y verrait un vol).
 *
 * @param {ApiClientDependencies} deps
 */
export function createApiClient({
  baseUrl,
  fetchImpl = (input, init) => globalThis.fetch(input, init),
  getAccessToken,
  setAccessToken,
  onSessionExpired,
  locks,
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

  const csrf = createCsrfToken({
    fetchToken: async () => {
      const response = await send(urlFor(CSRF_PATH), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw await toApiError(response);
      }
      const parsed = csrfTokenResponseSchema.safeParse(await readJson(response));
      if (!parsed.success) {
        throw invalidResponseError(response);
      }
      return parsed.data.csrfToken;
    },
  });

  /** @returns {Promise<string>} Le nouvel access token. */
  async function requestAccessToken() {
    const response = await csrf.sendWith((csrfToken) =>
      send(urlFor(REFRESH_PATH), {
        method: 'POST',
        headers: { Accept: 'application/json', [CSRF_HEADER]: csrfToken },
      }),
    );
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
      const accessToken = await withCrossTabLock(REFRESH_LOCK, requestAccessToken, locks);
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
   * @param {string | null} csrfToken
   */
  function sendAuthenticated(
    path,
    { method = 'GET', body, query, headers, signal },
    accessToken,
    csrfToken,
  ) {
    /** @type {Record<string, string>} */
    const allHeaders = { Accept: 'application/json', ...headers };
    if (body !== undefined) {
      allHeaders['Content-Type'] = 'application/json';
    }
    if (accessToken) {
      allHeaders.Authorization = `Bearer ${accessToken}`;
    }
    if (csrfToken) {
      allHeaders[CSRF_HEADER] = csrfToken;
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
   * @param {import('./api-error.js').ApiError} rejection Le 401 reçu.
   * @returns {Promise<string>}
   */
  async function renewAfter(sent, rejection) {
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
    throw rejection;
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
    /** @param {string | null} accessToken */
    const sendOnce = (accessToken) =>
      (options.method ?? 'GET') === 'GET'
        ? sendAuthenticated(path, options, accessToken, null)
        : csrf.sendWith((csrfToken) => sendAuthenticated(path, options, accessToken, csrfToken));
    let response = await sendOnce(sent.accessToken);

    if (response.status === 401) {
      const rejection = await toApiError(response);
      if (rejection.code !== 'UNAUTHENTICATED') {
        throw rejection;
      }
      response = await sendOnce(await renewAfter(sent, rejection));
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

/** Client de l'application, branché sur la session en mémoire. */
export const apiClient = createApiClient({
  baseUrl: resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  getAccessToken: () => useSessionStore.getState().accessToken,
  setAccessToken: (accessToken) => useSessionStore.getState().setAccessToken(accessToken),
  onSessionExpired: () => useSessionStore.getState().clear(),
});

export { DEFAULT_API_BASE_URL, resolveApiBaseUrl } from './api-base-url.js';
