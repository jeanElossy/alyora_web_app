import { describe, expect, it } from 'vitest';
import { ApiError } from '../lib/api/api-error.js';
import {
  DEFAULT_STALE_TIME_MS,
  MAX_QUERY_RETRIES,
  createQueryClient,
  shouldRetry,
} from './query-client.js';
import { queryKeys } from './queryKeys.js';

/** @param {number} status */
const apiError = (status) =>
  new ApiError({ code: status === 0 ? 'NETWORK_ERROR' : 'INTERNAL_ERROR', status, message: 'x' });

describe('query client', () => {
  it('has an explicit stale time and never retries a mutation', () => {
    const defaults = createQueryClient().getDefaultOptions();

    expect(defaults.queries?.staleTime).toBe(DEFAULT_STALE_TIME_MS);
    expect(DEFAULT_STALE_TIME_MS).toBeGreaterThan(0);
    expect(defaults.mutations?.retry).toBe(false);
  });

  it.each([400, 401, 403, 404, 409, 413, 429])('does not retry a %i error', (status) => {
    expect(shouldRetry(0, apiError(status))).toBe(false);
  });

  it.each([0, 500, 502, 503])(
    `retries a %i error, ${MAX_QUERY_RETRIES} times at most`,
    (status) => {
      expect(shouldRetry(0, apiError(status))).toBe(true);
      expect(shouldRetry(MAX_QUERY_RETRIES - 1, apiError(status))).toBe(true);
      expect(shouldRetry(MAX_QUERY_RETRIES, apiError(status))).toBe(false);
    },
  );

  it('queries a failing 404 only once, but retries a 503 (behaviour of the real client)', async () => {
    const queryClient = createQueryClient();
    let notFoundCalls = 0;
    let unavailableCalls = 0;

    await queryClient
      .prefetchQuery({
        queryKey: ['test', 404],
        queryFn: async () => {
          notFoundCalls += 1;
          throw apiError(404);
        },
        retryDelay: 0,
      })
      .catch(() => {});
    await queryClient.prefetchQuery({
      queryKey: ['test', 503],
      queryFn: async () => {
        unavailableCalls += 1;
        throw apiError(503);
      },
      retryDelay: 0,
    });

    expect(notFoundCalls).toBe(1);
    expect(unavailableCalls).toBe(1 + MAX_QUERY_RETRIES);
  });
});

describe('queryKeys', () => {
  it('builds keys that extend their domain key, so invalidating the domain covers them', () => {
    expect(queryKeys.system.ping().slice(0, queryKeys.system.all.length)).toEqual(
      queryKeys.system.all,
    );
  });
});
