import { randomUUID } from 'node:crypto';
import {
  backupCodesResponseSchema,
  twoFactorChallengeResponseSchema,
  twoFactorSetupResponseSchema,
} from '@alyora/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { REFRESH_COOKIE } from '../../src/lib/http/cookies.js';
import { buildTestApp } from '../helpers/app.js';
import {
  cookieFrom,
  createBrowser,
  createFastPasswordHasher,
  createTestClock,
  registration,
  useAuthDatabase,
} from '../helpers/auth.js';
import { tokenFrom } from '../helpers/mail.js';
import { EMAIL, PASSWORD, totpCode } from '../helpers/two-factor.js';

useAuthDatabase();

/** Un navigateur connecté à un compte vérifié, avec une horloge réglable. */
async function signedIn() {
  const clock = createTestClock();
  const built = buildTestApp({ passwordHasher: createFastPasswordHasher(), clock });
  const browser = createBrowser(built.app);
  await browser.post('/auth/register', registration(), { 'Idempotency-Key': randomUUID() });
  await browser.post('/auth/verify-email', {
    token: tokenFrom(built.mailer.to(EMAIL).at(-1), 'verifyEmail'),
  });
  await browser.login(EMAIL, PASSWORD);
  return { ...built, browser, clock };
}

/** @param {Awaited<ReturnType<typeof signedIn>>} account */
async function enableTwoFactor({ browser, clock }) {
  const setup = await browser.post('/auth/2fa/setup');
  const { secret } = twoFactorSetupResponseSchema.parse(setup.body);
  const enabled = await browser.post('/auth/2fa/enable', { otp: totpCode(secret, clock.now()) });
  clock.advance(30_000);
  return { secret, backupCodes: backupCodesResponseSchema.parse(enabled.body).backupCodes };
}

describe('2FA through HTTP', () => {
  it('setup → enable → login asks for a code → verify opens the session', async () => {
    const account = await signedIn();
    const { secret } = await enableTwoFactor(account);

    const login = await createBrowser(account.app).login(EMAIL, PASSWORD);

    expect(login.status).toBe(200);
    const { challengeToken } = twoFactorChallengeResponseSchema.parse(login.body);
    expect(cookieFrom(login, REFRESH_COOKIE)).toBeUndefined();

    const browser = createBrowser(account.app);
    const verified = await browser.post('/auth/2fa/verify', {
      challengeToken,
      otp: totpCode(secret, account.clock.now()),
    });
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual({ accessToken: expect.any(String) });
    expect(cookieFrom(verified, REFRESH_COOKIE)?.attributes).toMatch(/HttpOnly/);
    expect((await browser.get('/auth/me')).body.twoFactorEnabled).toBe(true);
  });

  it('refuses a wrong code with INVALID_TWO_FACTOR_CODE', async () => {
    const account = await signedIn();
    await enableTwoFactor(account);
    const { challengeToken } = (await createBrowser(account.app).login(EMAIL, PASSWORD)).body;

    const response = await createBrowser(account.app).post('/auth/2fa/verify', {
      challengeToken,
      otp: '000000',
    });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_TWO_FACTOR_CODE');
  });

  it('never writes the secret, a code or the challenge in the logs', async () => {
    const account = await signedIn();
    const { secret, backupCodes } = await enableTwoFactor(account);
    const { challengeToken } = (await createBrowser(account.app).login(EMAIL, PASSWORD)).body;
    const code = totpCode(secret, account.clock.now());
    await createBrowser(account.app).post('/auth/2fa/verify', { challengeToken, otp: code });

    for (const value of [secret, challengeToken, code, ...backupCodes]) {
      expect(account.logs.text()).not.toContain(value);
    }
  });
});

describe('requireRecentAuth on the sensitive operations', () => {
  it('refuses them 10 minutes after the authentication, until the password is confirmed', async () => {
    const account = await signedIn();
    account.clock.advance(11 * 60 * 1000);
    // L'access token a expiré entre-temps : le navigateur rafraîchit (auth_time inchangé).
    await account.browser.refresh();

    const stale = await account.browser.post('/auth/2fa/setup');
    expect(stale.status).toBe(401);
    expect(stale.body.code).toBe('REAUTHENTICATION_REQUIRED');

    const reauthenticated = await account.browser.post('/auth/reauthenticate', {
      password: PASSWORD,
    });
    expect(reauthenticated.status).toBe(200);
    expect((await account.browser.post('/auth/2fa/setup')).status).toBe(200);
  });

  it.each([
    ['/auth/2fa/setup', undefined],
    ['/auth/2fa/enable', { otp: '123456' }],
    ['/auth/2fa/disable', { otp: '123456' }],
    ['/auth/password', { newPassword: 'Les pirogues rentrent au port' }],
  ])('guards %s', async (path, body) => {
    const account = await signedIn();
    account.clock.advance(11 * 60 * 1000);
    await account.browser.refresh();

    const response = await account.browser.post(path, body);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('REAUTHENTICATION_REQUIRED');
  });
});

describe('forbidden access to the 2FA routes', () => {
  // Corps valides : la validation passe avant l'authentification (ordre du projet).
  it.each([
    ['/auth/2fa/setup', {}],
    ['/auth/2fa/enable', { otp: '123456' }],
    ['/auth/2fa/disable', { otp: '123456' }],
    ['/auth/reauthenticate', { password: 'x' }],
    ['/auth/password', { newPassword: 'Les pirogues rentrent au port' }],
  ])('POST %s without an access token answers 401', async (path, body) => {
    const { app } = buildTestApp({ passwordHasher: createFastPasswordHasher() });

    const response = await createBrowser(app).post(path, body);

    expect(response.status).toBe(401);
  });

  it.each([
    '/auth/2fa/verify',
    '/auth/2fa/setup',
    '/auth/2fa/enable',
    '/auth/2fa/disable',
    '/auth/reauthenticate',
    '/auth/password',
  ])('POST %s without a CSRF token answers 403', async (path) => {
    const { app } = buildTestApp({ passwordHasher: createFastPasswordHasher() });

    const response = await request(app).post(`/api/v1${path}`).send({});

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CSRF_INVALID');
  });

  it('refuses the 2FA setup to an unverified account', async () => {
    const { app } = buildTestApp({ passwordHasher: createFastPasswordHasher() });
    const browser = createBrowser(app);
    await browser.post('/auth/register', registration(), { 'Idempotency-Key': randomUUID() });
    await browser.login(EMAIL, PASSWORD);

    const response = await browser.post('/auth/2fa/setup');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('limits secret checks to 5 per 15 minutes for an account', async () => {
    const account = await signedIn();
    const statuses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push(
        (await account.browser.post('/auth/reauthenticate', { password: 'mauvais' })).status,
      );
    }

    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });
});

describe('password change through HTTP', () => {
  it('signs out the other devices and keeps the current one', async () => {
    const account = await signedIn();
    const laptop = createBrowser(account.app);
    await laptop.login(EMAIL, PASSWORD);

    const changed = await account.browser.post('/auth/password', {
      newPassword: 'Les pirogues rentrent au port',
    });

    expect(changed.status).toBe(204);
    expect((await laptop.refresh()).status).toBe(401);
    expect((await account.browser.refresh()).status).toBe(200);
  });
});
