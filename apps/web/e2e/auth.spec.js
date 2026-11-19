import { expect, test } from '@playwright/test';

const TOKEN = 'T'.repeat(43);
const CURRENT_USER = {
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
};
const SESSIONS = [
  {
    id: 'a'.repeat(24),
    deviceLabel: 'Chrome · Android',
    createdAt: '2026-11-19T10:00:00.000Z',
    lastSeenAt: '2026-11-19T10:30:00.000Z',
    current: true,
  },
  {
    id: 'b'.repeat(24),
    deviceLabel: 'Safari · iOS',
    createdAt: '2026-11-18T10:00:00.000Z',
    lastSeenAt: '2026-11-18T12:00:00.000Z',
    current: false,
  },
];

/**
 * Fausse API de l'authentification, avec un état (2FA active ou non) et l'enregistrement des
 * requêtes reçues.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ signedIn?: boolean, twoFactor?: boolean }} [options]
 */
async function fakeAuthApi(page, { signedIn = false, twoFactor = false } = {}) {
  const state = { twoFactorEnabled: false, reauthenticated: false };
  /** @type {Array<{ method: string, path: string, headers: Record<string, string>, body: unknown }>} */
  const requests = [];
  /** @param {number} status @param {unknown} [body] */
  const json = (status, body) => ({
    status,
    contentType: 'application/json',
    body: body === undefined ? '' : JSON.stringify(body),
  });
  /** @param {string} code @param {number} status */
  const error = (code, status) => json(status, { code, message: 'x', details: {} });

  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const key = `${request.method()} ${path}`;
    requests.push({
      method: request.method(),
      path,
      headers: request.headers(),
      body: request.postDataJSON?.() ?? null,
    });
    /** @type {Record<string, () => ReturnType<typeof json>>} */
    const routes = {
      'GET /auth/csrf': () => json(200, { csrfToken: 'e2e-csrf-token' }),
      'POST /auth/refresh': () =>
        signedIn ? json(200, { accessToken: 'e2e.access.token' }) : error('UNAUTHENTICATED', 401),
      'POST /auth/login': () =>
        twoFactor
          ? json(200, { status: 'two_factor_required', challengeToken: TOKEN })
          : json(200, { accessToken: 'e2e.access.token' }),
      'POST /auth/2fa/verify': () => json(200, { accessToken: 'e2e.access.token' }),
      'POST /auth/register': () => json(202, { status: 'accepted' }),
      'POST /auth/verify-email': () => json(200, { status: 'email_verified' }),
      'GET /auth/me': () =>
        json(200, { ...CURRENT_USER, twoFactorEnabled: state.twoFactorEnabled }),
      'GET /auth/sessions': () => json(200, { sessions: SESSIONS }),
      'POST /auth/2fa/setup': () => {
        if (!state.reauthenticated) {
          return error('REAUTHENTICATION_REQUIRED', 401);
        }
        return json(200, {
          secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
          otpauthUri: 'otpauth://totp/ALYORA:awa%40exemple.ci?secret=JBSWY3DPEHPK3PXP',
          qrCodeDataUrl:
            'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMCAxMCI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIi8+PC9zdmc+',
        });
      },
      'POST /auth/reauthenticate': () => {
        state.reauthenticated = true;
        return json(200, { accessToken: 'e2e.fresh.token' });
      },
      'POST /auth/2fa/enable': () => {
        state.twoFactorEnabled = true;
        return json(200, {
          backupCodes: [
            'ABCDE-FGH22',
            'ABCDE-FGH23',
            'ABCDE-FGH24',
            'ABCDE-FGH25',
            'ABCDE-FGH26',
            'ABCDE-FGH27',
            'ABCDE-FGH32',
            'ABCDE-FGH33',
          ],
        });
      },
    };
    return route.fulfill(routes[key]?.() ?? error('NOT_FOUND', 404));
  });
  return { requests };
}

/** @param {import('@playwright/test').Page} page */
async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('signs in with a second factor, then goes back to the page asked for', async ({ page }) => {
  const api = await fakeAuthApi(page, { twoFactor: true });
  await page.goto('/organisateur/securite');
  await expect(page).toHaveURL(/\/organisateur\/connexion\?retour=%2Forganisateur%2Fsecurite/);
  await expectNoHorizontalScroll(page);

  await page.getByLabel('Adresse e-mail').fill('awa@exemple.ci');
  await page.getByLabel('Mot de passe', { exact: false }).first().fill('Le soleil se lève');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Double authentification' }),
  ).toBeVisible();
  await page.getByLabel(/Code de l’application/).fill('123456');
  await page.getByRole('button', { name: 'Valider' }).click();

  await expect(page).toHaveURL('/organisateur/securite');
  await expect(page.getByRole('heading', { level: 1, name: 'Sécurité' })).toBeVisible();
  const login = api.requests.find((request) => request.path === '/auth/login');
  expect(login?.headers['x-csrf-token']).toBe('e2e-csrf-token');
});

test('creates an account and says to check the mailbox', async ({ page }) => {
  const api = await fakeAuthApi(page);
  await page.goto('/inscription');
  await expectNoHorizontalScroll(page);

  await page.getByLabel(/Prénom/).fill('Awa');
  await page.getByLabel(/^Nom/).fill('Koné');
  await page.getByLabel(/Adresse e-mail/).fill('awa@exemple.ci');
  await page.getByLabel(/^Mot de passe/).fill('Le soleil se lève sur la lagune');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Vérifiez votre boîte de réception' }),
  ).toBeVisible();
  const register = api.requests.find((request) => request.path === '/auth/register');
  expect(register?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
});

test('verifies the address from the e-mailed link, and erases the token from the address', async ({
  page,
}) => {
  const api = await fakeAuthApi(page);
  await page.goto(`/verifier-email#jeton=${TOKEN}`);

  await expect(page.getByRole('heading', { level: 1, name: 'Adresse confirmée' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  expect(api.requests.find((request) => request.path === '/auth/verify-email')?.body).toEqual({
    token: TOKEN,
  });
});

test('turns 2FA on from the security page, after confirming the password', async ({ page }) => {
  const api = await fakeAuthApi(page, { signedIn: true });
  await page.goto('/organisateur/securite');
  await expect(page.getByText('Safari · iOS')).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Activer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmer votre identité' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^Mot de passe/).fill('Le soleil se lève');
  await dialog.getByRole('button', { name: 'Confirmer' }).click();

  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
  const enable = page.getByRole('form', { name: 'Activation de la double authentification' });
  await enable.getByLabel(/Code de l’application/).fill('123456');
  await enable.getByRole('button', { name: 'Activer' }).click();

  await expect(page.getByText('Vos codes de secours')).toBeVisible();
  await expect(page.getByText('ABCDE-FGH22')).toBeVisible();
  await expect(page.getByText('Activée', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(api.requests.filter((request) => request.path === '/auth/2fa/setup')).toHaveLength(2);
  expect(api.requests.filter((request) => request.path === '/auth/refresh')).toHaveLength(1);
});
