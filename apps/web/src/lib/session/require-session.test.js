import { describe, expect, it, vi } from 'vitest';
import { ApiError, networkError } from '../api/api-error.js';
import { createSessionGuard } from './require-session.js';

/** @param {string} url */
const loaderArgs = (url) =>
  /** @type {import('react-router').LoaderFunctionArgs} */ (
    /** @type {unknown} */ ({ request: new Request(url), params: {}, context: undefined })
  );

describe('session guard', () => {
  it('lets a visitor with a session in', async () => {
    const refreshSession = vi.fn();
    const guard = createSessionGuard({ getAccessToken: () => 'token', refreshSession });

    await expect(
      guard('/organisateur/connexion')(loaderArgs('http://x/organisateur')),
    ).resolves.toBeNull();
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('restores a session lost by a page reload through a silent refresh', async () => {
    const refreshSession = vi.fn(async () => 'fresh');
    const guard = createSessionGuard({ getAccessToken: () => null, refreshSession });

    await expect(
      guard('/organisateur/connexion')(loaderArgs('http://x/organisateur')),
    ).resolves.toBeNull();
    expect(refreshSession).toHaveBeenCalledOnce();
  });

  it('redirects a visitor without session to the login page, keeping the page asked for', async () => {
    const guard = createSessionGuard({
      getAccessToken: () => null,
      refreshSession: async () => {
        throw new ApiError({ code: 'UNAUTHENTICATED', status: 401, message: 'refused' });
      },
    });

    const outcome = await Promise.resolve(
      guard('/organisateur/connexion')(loaderArgs('http://x/organisateur/invites?page=2')),
    ).catch((/** @type {unknown} */ thrown) => thrown);

    expect(outcome).toBeInstanceOf(Response);
    const response = /** @type {Response} */ (outcome);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      '/organisateur/connexion?retour=%2Forganisateur%2Finvites%3Fpage%3D2',
    );
  });

  it.each([
    ['the network fails', networkError(new TypeError('Failed to fetch'))],
    [
      'the API is unavailable',
      new ApiError({ code: 'SERVICE_UNAVAILABLE', status: 503, message: 'unavailable' }),
    ],
  ])('lets the error reach the error page, not the login page, when %s', async (_case, error) => {
    const guard = createSessionGuard({
      getAccessToken: () => null,
      refreshSession: async () => {
        throw error;
      },
    });

    const outcome = await Promise.resolve(
      guard('/organisateur/connexion')(loaderArgs('http://x/organisateur')),
    ).catch((/** @type {unknown} */ thrown) => thrown);

    expect(outcome).toBe(error);
  });
});
