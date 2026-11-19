import { describe, expect, it, vi } from 'vitest';
import { BASE, createClient, jsonResponse } from '../../../test/api-doubles.js';
import { ApiError, isDefinitiveRejection, networkError } from './api-error.js';
import { resolveApiBaseUrl } from './api-client.js';

describe('apiClient.request', () => {
  it('sends credentials, the access token and the query, and returns the JSON body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { status: 'ok' }));
    const { client } = createClient(
      { fetchImpl: /** @type {typeof fetch} */ (/** @type {unknown} */ (fetchImpl)) },
      'token-1',
    );

    const data = await client.request('/ping', { query: { page: 2, skip: undefined } });

    expect(data).toEqual({ status: 'ok' });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE}/ping?page=2`,
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      }),
    );
  });

  it('sends a JSON body and returns undefined for 204 No Content', async () => {
    const fetchImpl = vi.fn(async (/** @type {string} */ url) =>
      url.endsWith('/auth/csrf')
        ? jsonResponse(200, { csrfToken: 'csrf-1' })
        : new Response(null, { status: 204 }),
    );
    const { client } = createClient(
      { fetchImpl: /** @type {typeof fetch} */ (/** @type {unknown} */ (fetchImpl)) },
      'token-1',
    );

    const data = await client.request('/things', { method: 'POST', body: { name: 'Awa' } });

    expect(data).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE}/things`,
      expect.objectContaining({
        body: '{"name":"Awa"}',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'csrf-1',
        }),
      }),
    );
  });

  it('turns a normalized error into a typed ApiError, with the correlation id', async () => {
    const details = { issues: [{ path: 'email', code: 'invalid_format', message: 'Invalid' }] };
    const fetchImpl = async () =>
      jsonResponse(
        400,
        { code: 'VALIDATION_ERROR', message: 'Invalid request body', details },
        { 'X-Request-Id': 'req-0123456789' },
      );
    const { client } = createClient({ fetchImpl }, 'token-1');

    const error = await client.request('/guests', { method: 'POST', body: {} }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
      details,
      requestId: 'req-0123456789',
    });
  });

  it('turns a response that is not in the normalized format into INVALID_RESPONSE', async () => {
    const fetchImpl = async () =>
      new Response('<html>Bad Gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      });
    const { client } = createClient({ fetchImpl }, 'token-1');

    const error = await client.request('/ping').catch((e) => e);

    expect(error).toMatchObject({ code: 'INVALID_RESPONSE', status: 502 });
  });

  it('turns a request that never reached the API into NETWORK_ERROR, with status 0', async () => {
    const fetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    const { client } = createClient({ fetchImpl }, 'token-1');

    const error = await client.request('/ping').catch((e) => e);

    expect(error).toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });

  it('lets a cancellation through as an AbortError, not as a network error', async () => {
    const fetchImpl = async () => {
      throw new DOMException('The operation was aborted', 'AbortError');
    };
    const { client } = createClient({ fetchImpl }, 'token-1');

    const error = await client.request('/ping').catch((e) => e);

    expect(error).toBeInstanceOf(DOMException);
    expect(/** @type {DOMException} */ (error).name).toBe('AbortError');
  });
});

describe('isDefinitiveRejection', () => {
  /** @param {number} status */
  const errorWith = (status) => new ApiError({ code: 'INTERNAL_ERROR', status, message: 'x' });

  it.each([400, 401, 403, 404, 409, 413])('says a %i is final', (status) => {
    expect(isDefinitiveRejection(errorWith(status))).toBe(true);
  });

  it.each([200, 408, 429, 500, 502, 503])('says a %i may pass later', (status) => {
    expect(isDefinitiveRejection(errorWith(status))).toBe(false);
  });

  it('says a network failure or an error from elsewhere may pass later', () => {
    expect(isDefinitiveRejection(networkError(new TypeError('Failed to fetch')))).toBe(false);
    expect(isDefinitiveRejection(new Error('bug'))).toBe(false);
  });
});

describe('resolveApiBaseUrl', () => {
  it('defaults to the same origin', () => {
    expect(resolveApiBaseUrl(undefined)).toBe('/api/v1');
    expect(resolveApiBaseUrl('  ')).toBe('/api/v1');
  });

  it('accepts an http(s) URL or an absolute path', () => {
    expect(resolveApiBaseUrl('http://localhost:3000/api/v1')).toBe('http://localhost:3000/api/v1');
    expect(resolveApiBaseUrl('/api/v1')).toBe('/api/v1');
  });

  it.each(['api/v1', '//evil.example/api', 'ftp://x/api', 'https://api.example/api/v1/'])(
    'refuses %s',
    (value) => {
      expect(() => resolveApiBaseUrl(value)).toThrow(/VITE_API_BASE_URL/);
    },
  );
});
