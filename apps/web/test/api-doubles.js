// Doublures du client API pour les tests : un faux serveur et un client branché dessus.
import { vi } from 'vitest';
import { createApiClient } from '../src/lib/api/api-client.js';

export const BASE = 'https://api.alyora.example/api/v1';

/**
 * @param {number} status
 * @param {unknown} [body]
 * @param {Record<string, string>} [headers]
 */
export function jsonResponse(status, body, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export const unauthenticated = () =>
  jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'Authentication required', details: {} });

/**
 * Faux serveur : /auth/refresh répond avec `refresh()`, les autres routes acceptent seulement
 * le jeton courant du serveur. Les appels sont enregistrés.
 *
 * @param {object} [options]
 * @param {() => Promise<Response> | Response} [options.refresh]
 * @param {number} [options.refreshDelayMs]
 */
export function createServer({ refresh, refreshDelayMs = 20 } = {}) {
  const state = { validToken: 'fresh-token', refreshCalls: 0 };
  /** @type {Array<{ url: string, init: RequestInit }>} */
  const calls = [];
  const fetchImpl = vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/refresh')) {
      state.refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, refreshDelayMs));
      return refresh ? refresh() : jsonResponse(200, { accessToken: state.validToken });
    }
    const headers = /** @type {Record<string, string>} */ (init.headers ?? {});
    if (headers.Authorization !== `Bearer ${state.validToken}`) {
      return unauthenticated();
    }
    return jsonResponse(200, { url });
  });
  return {
    state,
    calls,
    fetchImpl: /** @type {typeof fetch} */ (/** @type {unknown} */ (fetchImpl)),
  };
}

/** @param {{ fetchImpl: typeof fetch }} server @param {string | null} [initialToken] */
export function createClient(server, initialToken = 'expired-token') {
  const session = { token: initialToken, expired: 0 };
  const client = createApiClient({
    baseUrl: BASE,
    fetchImpl: server.fetchImpl,
    getAccessToken: () => session.token,
    setAccessToken: (token) => {
      session.token = token;
    },
    onSessionExpired: () => {
      session.token = null;
      session.expired += 1;
    },
  });
  return { client, session };
}
