import { describe, expect, it, vi } from 'vitest';
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
        throw new Error('refused');
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
});
