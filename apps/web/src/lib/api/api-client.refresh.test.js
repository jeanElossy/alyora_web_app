import { describe, expect, it, vi } from 'vitest';
import {
  BASE,
  createClient,
  createServer,
  jsonResponse,
  unauthenticated,
} from '../../../test/api-doubles.js';
import { createApiClient } from './api-client.js';

describe('silent session refresh on 401 (race)', () => {
  it('runs a single refresh for 5 requests rejected at the same time, then replays each once', async () => {
    const server = createServer();
    const { client, session } = createClient(server);

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) => client.request(`/items/${index}`)),
    );

    expect(server.state.refreshCalls).toBe(1);
    expect(results).toEqual(
      Array.from({ length: 5 }, (_, index) => ({ url: `${BASE}/items/${index}` })),
    );
    expect(session.token).toBe('fresh-token');
    // 5 envois rejetés, 1 refresh, 5 rejeux.
    expect(server.calls).toHaveLength(11);
  });

  it('holds a request that starts during a refresh until the refresh ends', async () => {
    const server = createServer({ refreshDelayMs: 50 });
    const { client } = createClient(server);

    const first = client.request('/a');
    await vi.waitFor(() => expect(server.state.refreshCalls).toBe(1));
    const second = client.request('/b');
    await Promise.all([first, second]);

    expect(server.state.refreshCalls).toBe(1);
    const sentForB = server.calls.filter(({ url }) => url.endsWith('/b'));
    expect(sentForB).toHaveLength(1);
    expect(sentForB[0]?.init.headers).toMatchObject({ Authorization: 'Bearer fresh-token' });
  });

  it('does not refresh again for a 401 that arrives after another call renewed the session', async () => {
    const server = createServer();
    const session = { token: 'expired-token' };
    let firstSend = true;
    const client = createApiClient({
      baseUrl: BASE,
      fetchImpl: async (url, init) => {
        if (firstSend) {
          // Pendant que cette requête était en vol avec l'ancien jeton, une autre a renouvelé
          // la session : le 401 arrive alors que le nouveau jeton est déjà là.
          firstSend = false;
          session.token = 'fresh-token';
          return unauthenticated();
        }
        return server.fetchImpl(url, init);
      },
      getAccessToken: () => session.token,
      setAccessToken: (token) => {
        session.token = token;
      },
      onSessionExpired: () => {},
    });

    await expect(client.request('/late')).resolves.toEqual({ url: `${BASE}/late` });
    expect(server.state.refreshCalls).toBe(0);
  });

  it('ends the session once and rejects every request when the API refuses the refresh', async () => {
    const server = createServer({ refresh: unauthenticated });
    const { client, session } = createClient(server);

    const outcomes = await Promise.allSettled(
      Array.from({ length: 3 }, () => client.request('/items')),
    );

    expect(server.state.refreshCalls).toBe(1);
    expect(session.expired).toBe(3);
    expect(session.token).toBeNull();
    for (const outcome of outcomes) {
      expect(outcome).toMatchObject({
        status: 'rejected',
        reason: { code: 'UNAUTHENTICATED', status: 401 },
      });
    }
  });

  it('keeps the session when the refresh fails because of the network', async () => {
    const server = createServer({
      refresh: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const { client, session } = createClient(server);

    const error = await client.request('/items').catch((e) => e);

    expect(error).toMatchObject({ code: 'NETWORK_ERROR' });
    expect(session.expired).toBe(0);
  });

  it('gives up after one replay when the new token is refused too: no refresh loop', async () => {
    const server = createServer({
      refresh: () => jsonResponse(200, { accessToken: 'still-refused' }),
    });
    const { client } = createClient(server);

    const error = await client.request('/items').catch((e) => e);

    expect(error).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(server.state.refreshCalls).toBe(1);
  });

  it('refuses a refresh response that is not in the expected format', async () => {
    const server = createServer({ refresh: () => jsonResponse(200, { token: 'x' }) });
    const { client } = createClient(server);

    const error = await client.request('/items').catch((e) => e);

    expect(error).toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
