import { render, screen, within } from '@testing-library/react';
import i18next from 'i18next';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LANGUAGE, KEYS_LANGUAGE } from '../lib/i18n/i18n.js';
import { useSessionStore } from '../lib/session/session-store.js';
import { routes } from './router.jsx';

/** @param {string} key */
const t = (key) => i18next.t(key);

/** Une clé de traduction telle que la langue des clés l'affiche ("home.title"). */
const TRANSLATION_KEY = /^[A-Za-z0-9_.:-]+$/;

/** @param {string} path */
function renderAt(path) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

/** @param {string} name */
const findTitle = (name) => screen.findByRole('heading', { level: 1, name });

beforeAll(async () => {
  // Les traductions d'un espace s'enregistrent au chargement de son bundle : les attentes des
  // tests en ont besoin avant le premier rendu. Le routage, lui, reste paresseux.
  await Promise.all([
    import('../spaces/public/public-space.jsx'),
    import('../spaces/organizer/organizer-space.jsx'),
    import('../spaces/checkin/checkin-space.jsx'),
    import('../spaces/admin/admin-space.jsx'),
  ]);
});

beforeEach(() => {
  // L'API refuse le refresh : pas de session sans jeton en mémoire.
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 'UNAUTHENTICATED',
            message: 'Authentication required',
            details: {},
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  useSessionStore.getState().clear();
  await i18next.changeLanguage(DEFAULT_LANGUAGE);
});

describe('public space', () => {
  it('renders its own layout and navigation at the root', async () => {
    renderAt('/');

    expect(
      await findTitle(`${t('public:home.title')} ${t('public:home.titleAccent')}`),
    ).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: t('public:nav.label') });
    const home = within(nav).getByRole('link', { name: t('public:nav.home') });
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(document.title).toBe(t('public:home.documentTitle'));
  });

  it('answers an unknown path with its own 404 page', async () => {
    renderAt('/page-qui-n-existe-pas');

    expect(await findTitle(t('public:notFound.title'))).toBeTruthy();
    expect(screen.getByRole('link', { name: t('public:notFound.back') }).getAttribute('href')).toBe(
      '/',
    );
  });
});

describe.each([
  ['organisateur', 'organizer'],
  ['accueil', 'checkin'],
  ['admin', 'admin'],
])('/%s space', (segment, namespace) => {
  it('redirects a visitor without session to its login page (forbidden access)', async () => {
    const { router } = renderAt(`/${segment}`);

    expect(await findTitle(t(`${namespace}:login.title`))).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/${segment}/connexion`);
    expect(router.state.location.search).toBe(`?retour=%2F${segment}`);
    // Rien de l'espace protégé n'est affiché, pas même sa navigation.
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('shows its own layout and navigation to a visitor with a session', async () => {
    useSessionStore.getState().setAccessToken('access-token');
    renderAt(`/${segment}`);

    expect(await findTitle(t(`${namespace}:home.title`))).toBeTruthy();
    expect(screen.getByRole('navigation', { name: t(`${namespace}:nav.label`) })).toBeTruthy();
  });

  it('answers an unknown path with its own 404 page, once signed in', async () => {
    useSessionStore.getState().setAccessToken('access-token');
    renderAt(`/${segment}/page-inconnue`);

    expect(await findTitle(t(`${namespace}:notFound.title`))).toBeTruthy();
    expect(
      screen.getByRole('link', { name: t(`${namespace}:notFound.back`) }).getAttribute('href'),
    ).toBe(`/${segment}`);
  });
});

describe('translations', () => {
  it.each([
    '/',
    '/inconnue',
    '/organisateur',
    '/organisateur/inconnue',
    '/accueil',
    '/admin',
    '/admin/connexion',
  ])('leave no text outside of them on %s (keys language)', async (path) => {
    useSessionStore.getState().setAccessToken(path.endsWith('connexion') ? '' : 'access-token');
    await i18next.changeLanguage(KEYS_LANGUAGE);
    renderAt(path);

    await screen.findByRole('heading', { level: 1 });

    const words = (document.body.textContent ?? '').split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThan(0);
    for (const word of words) {
      expect(word).toMatch(TRANSLATION_KEY);
    }
    expect(document.title).toMatch(TRANSLATION_KEY);
  });
});
