import { expect, test } from '@playwright/test';

const PROTECTED_SPACES = [
  { path: '/organisateur', chunk: 'organizer-space', login: /Connexion à l’espace organisateur/ },
  { path: '/accueil', chunk: 'checkin-space', login: /Connexion à l’accueil des invités/ },
  { path: '/admin', chunk: 'admin-space', login: /Connexion à l’administration/ },
];
const SPACE_CHUNKS = ['public-space', ...PROTECTED_SPACES.map((space) => space.chunk)];

/**
 * Simule une session : l'API accepte le refresh silencieux et renvoie un access token.
 *
 * @param {import('@playwright/test').Page} page
 */
async function grantSession(page) {
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'e2e-access-token' }),
    }),
  );
}

/**
 * Bundles d'espace téléchargés par la page.
 *
 * @param {import('@playwright/test').Page} page
 */
function recordSpaceChunks(page) {
  /** @type {Set<string>} */
  const loaded = new Set();
  page.on('request', (request) => {
    for (const chunk of SPACE_CHUNKS) {
      if (new URL(request.url()).pathname.includes(`/${chunk}-`)) {
        loaded.add(chunk);
      }
    }
  });
  return loaded;
}

/** @param {import('@playwright/test').Page} page */
async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('public space', () => {
  test('has its own layout and navigation at 360 px, and loads no other space', async ({
    page,
  }) => {
    const loaded = recordSpaceChunks(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: /Votre mariage/ })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(nav.getByRole('link', { name: 'Accueil' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectNoHorizontalScroll(page);
    expect([...loaded]).toEqual(['public-space']);
  });

  test('answers an unknown page with its own 404', async ({ page }) => {
    await page.goto('/page-qui-n-existe-pas');

    await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Revenir à l’accueil' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  test('offers a skip link as the first stop of the keyboard, with a visible focus', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.keyboard.press('Tab');

    const skipLink = page.getByRole('link', { name: 'Aller au contenu' });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    const outline = await skipLink.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe('none');
  });
});

for (const space of PROTECTED_SPACES) {
  test.describe(`${space.path} space`, () => {
    test('sends a visitor without session to its login page (forbidden access)', async ({
      page,
    }) => {
      await page.goto(space.path);

      await expect(page.getByRole('heading', { level: 1, name: space.login })).toBeVisible();
      await expect(page).toHaveURL(
        `${space.path}/connexion?retour=${encodeURIComponent(space.path)}`,
      );
      await expect(page.getByRole('navigation')).toHaveCount(0);
      await expectNoHorizontalScroll(page);
    });

    test('restores a session silently, then shows its own layout, in its own bundle', async ({
      page,
    }) => {
      await grantSession(page);
      const loaded = recordSpaceChunks(page);
      await page.goto(space.path);

      await expect(page.getByRole('navigation')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
      expect([...loaded]).toEqual([space.chunk]);
    });

    test('answers an unknown page with its own 404, once signed in', async ({ page }) => {
      await grantSession(page);
      await page.goto(`${space.path}/page-inconnue`);

      await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible();
      await expect(page.getByRole('navigation')).toBeVisible();
    });
  });
}

test('moves from the public space to a protected one, loading its bundle on demand', async ({
  page,
}) => {
  const loaded = recordSpaceChunks(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Espace organisateur' })
    .click();

  await expect(
    page.getByRole('heading', { level: 1, name: /Connexion à l’espace organisateur/ }),
  ).toBeVisible();
  expect([...loaded].sort()).toEqual(['organizer-space', 'public-space']);
});
