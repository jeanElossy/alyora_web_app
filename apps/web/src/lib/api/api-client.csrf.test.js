import { describe, expect, it, vi } from 'vitest';
import {
  BASE,
  CSRF_TOKEN,
  createClient,
  createServer,
  jsonResponse,
} from '../../../test/api-doubles.js';
import { REFRESH_LOCK, createApiClient } from './api-client.js';
import { withCrossTabLock } from './cross-tab-lock.js';

/** @param {string} code @param {number} [status] */
const error = (code, status = 401) => jsonResponse(status, { code, message: 'x', details: {} });

/**
 * Client sur un faux serveur programmable : `routes` répond selon l'URL et la méthode.
 *
 * @param {(url: string, init: RequestInit) => Response | Promise<Response>} routes
 */
function clientOn(routes) {
  const calls = /** @type {Array<{ url: string, init: RequestInit }>} */ ([]);
  const fetchImpl = vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/csrf')) {
      return jsonResponse(200, { csrfToken: CSRF_TOKEN });
    }
    return routes(url, init);
  });
  const { client, session } = createClient(
    { fetchImpl: /** @type {typeof fetch} */ (/** @type {unknown} */ (fetchImpl)) },
    'token-1',
  );
  return { client, session, calls };
}

/** @param {RequestInit} init */
const headersOf = (init) => /** @type {Record<string, string>} */ (init.headers ?? {});

describe('CSRF token', () => {
  it('is fetched once for simultaneous state-changing requests, and never sent with a GET', async () => {
    const { client, calls } = clientOn(() => jsonResponse(200, { ok: true }));

    await Promise.all([
      client.request('/a', { method: 'POST', body: {} }),
      client.request('/b', { method: 'PATCH', body: {} }),
      client.request('/c', { method: 'DELETE' }),
      client.request('/d'),
    ]);

    expect(calls.filter(({ url }) => url.endsWith('/auth/csrf'))).toHaveLength(1);
    for (const { url, init } of calls.filter((call) => /\/[abc]$/.test(call.url))) {
      expect(headersOf(init)['X-CSRF-Token'], url).toBe(CSRF_TOKEN);
    }
    const read = calls.find(({ url }) => url.endsWith('/d'));
    expect(headersOf(read?.init ?? {})['X-CSRF-Token']).toBeUndefined();
  });

  it('is fetched again and the request replayed once when the API refuses it', async () => {
    let refusals = 1;
    const { client, calls } = clientOn(() =>
      refusals-- > 0 ? error('CSRF_INVALID', 403) : jsonResponse(200, { ok: true }),
    );

    await expect(client.request('/a', { method: 'POST', body: {} })).resolves.toEqual({ ok: true });
    expect(calls.filter(({ url }) => url.endsWith('/auth/csrf'))).toHaveLength(2);
  });

  it('gives up after one replay: no loop', async () => {
    const { client, calls } = clientOn(() => error('CSRF_INVALID', 403));

    await expect(client.request('/a', { method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'CSRF_INVALID',
    });
    expect(calls.filter(({ url }) => url.endsWith('/a'))).toHaveLength(2);
  });

  it('lets another 403 through untouched', async () => {
    const { client, calls } = clientOn(() => error('FORBIDDEN', 403));

    await expect(client.request('/a', { method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(calls.filter(({ url }) => url.endsWith('/a'))).toHaveLength(1);
  });

  it('protects the refresh too, which survives an expired CSRF cookie', async () => {
    const server = createServer();
    let csrfRequests = 0;
    // Le premier jeton obtenu ne correspond plus au cookie (expiré) : l'API refuse le refresh.
    const fetchImpl = /** @type {typeof fetch} */ (
      async (url, init) => {
        if (String(url).endsWith('/auth/csrf') && csrfRequests++ === 0) {
          return jsonResponse(200, { csrfToken: 'stale' });
        }
        return server.fetchImpl(url, init);
      }
    );
    const { client, session } = createClient({ fetchImpl });

    await expect(client.request('/items')).resolves.toEqual({ url: `${BASE}/items` });
    expect(csrfRequests).toBe(2);
    expect(session.expired).toBe(0);
    expect(server.state.refreshCalls).toBe(1);
  });
});

describe('which 401 triggers a refresh', () => {
  it.each(['INVALID_CREDENTIALS', 'INVALID_TWO_FACTOR_CODE', 'REAUTHENTICATION_REQUIRED'])(
    'never %s: it is the answer itself',
    async (code) => {
      const { client, calls, session } = clientOn(() => error(code));

      await expect(
        client.request('/auth/login', { method: 'POST', body: {} }),
      ).rejects.toMatchObject({ code, status: 401 });
      expect(calls.filter(({ url }) => url.endsWith('/auth/refresh'))).toHaveLength(0);
      expect(session.expired).toBe(0);
    },
  );

  it('UNAUTHENTICATED only', async () => {
    const server = createServer();
    const { client } = createClient(server);

    await client.request('/items');

    expect(server.state.refreshCalls).toBe(1);
  });
});

describe('cross-tab refresh', () => {
  it('runs the refresh under the shared lock', async () => {
    const server = createServer();
    const request = vi.fn(
      async (/** @type {string} */ _name, /** @type {() => Promise<unknown>} */ task) => task(),
    );
    const client = createApiClient({
      baseUrl: BASE,
      fetchImpl: server.fetchImpl,
      getAccessToken: () => null,
      setAccessToken: () => {},
      onSessionExpired: () => {},
      locks: { request },
    });

    await client.refreshSession();

    expect(request).toHaveBeenCalledWith(REFRESH_LOCK, expect.any(Function));
  });

  it('serializes the tasks of a lock, and runs without one when Web Locks is missing', async () => {
    /** @type {Promise<unknown>} */
    let queue = Promise.resolve();
    const locks = {
      /** @param {string} _name @param {() => Promise<unknown>} task */
      request: (_name, task) => {
        const run = queue.then(task);
        queue = run.catch(() => {});
        return run;
      },
    };
    const order = /** @type {string[]} */ ([]);
    const task = (/** @type {string} */ id) => async () => {
      order.push(`start ${id}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(`end ${id}`);
    };

    await Promise.all([
      withCrossTabLock('x', task('a'), /** @type {any} */ (locks)),
      withCrossTabLock('x', task('b'), /** @type {any} */ (locks)),
    ]);
    await withCrossTabLock('x', task('c'), undefined);

    expect(order).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });
});
