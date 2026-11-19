// Fausse API pour les tests de pages : un gestionnaire par « MÉTHODE /chemin », les appels
// enregistrés. Remplace fetch (le client API l'appelle à chaque requête).
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { createQueryClient } from '../src/app/query-client.js';
import { routes } from '../src/app/router.jsx';
import { jsonResponse } from './api-doubles.js';

/** @typedef {{ method: string, path: string, body: any, headers: Record<string, string> }} FakeCall */
/** @typedef {(call: FakeCall) => Response | Promise<Response>} FakeHandler */

/** @param {string} code @param {number} status */
export const apiError = (code, status) => jsonResponse(status, { code, message: 'x', details: {} });

/**
 * @param {Record<string, FakeHandler>} handlers Clés « POST /auth/login » (chemin sous /api/v1).
 */
export function installFakeApi(handlers) {
  /** @type {FakeCall[]} */
  const calls = [];
  const fetchImpl = vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
    const path = new URL(url, 'http://localhost').pathname.replace(/^\/api\/v1/, '');
    const method = init.method ?? 'GET';
    const call = {
      method,
      path,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: /** @type {Record<string, string>} */ (init.headers ?? {}),
    };
    calls.push(call);
    if (path === '/auth/csrf') {
      return jsonResponse(200, { csrfToken: 'csrf-test-token' });
    }
    const handler = handlers[`${method} ${path}`];
    return handler ? handler(call) : apiError('NOT_FOUND', 404);
  });
  vi.stubGlobal('fetch', fetchImpl);
  return {
    calls,
    /** @param {string} method @param {string} path */
    callsTo: (method, path) => calls.filter((call) => call.method === method && call.path === path),
  };
}

/**
 * L'application à une adresse, avec ses vrais fournisseurs.
 *
 * @param {string} path
 */
export function renderApp(path) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    createElement(
      QueryClientProvider,
      { client: createQueryClient() },
      createElement(RouterProvider, { router }),
    ),
  );
  return { router, ...view };
}

/** Le compte connecté, tel que le renvoie GET /auth/me. */
export const CURRENT_USER = Object.freeze({
  id: '65f000000000000000000001',
  email: 'awa@exemple.ci',
  firstName: 'Awa',
  lastName: 'Koné',
  phone: null,
  accountType: 'individual',
  emailVerified: true,
  phoneVerified: false,
  twoFactorEnabled: false,
  avatarUrl: null,
  locale: 'fr',
  timezone: 'Africa/Abidjan',
  createdAt: '2026-11-19T10:00:00.000Z',
});
