import { randomUUID } from 'node:crypto';
import {
  acceptedResponseSchema,
  authSessionListResponseSchema,
  csrfTokenResponseSchema,
  currentUserSchema,
  loginResponseSchema,
} from '@alyora/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from '../../src/lib/http/cookies.js';
import { buildTestApp } from '../helpers/app.js';
import {
  cookieFrom,
  createBrowser,
  createFastPasswordHasher,
  registration,
  useAuthDatabase,
} from '../helpers/auth.js';
import { tokenFrom } from '../helpers/mail.js';

useAuthDatabase();

const EMAIL = 'awa.kone@exemple.ci';
const PASSWORD = 'Le soleil se lève sur la lagune';

function buildApp() {
  return buildTestApp({ passwordHasher: createFastPasswordHasher() });
}

/**
 * @param {ReturnType<typeof createBrowser>} browser
 * @param {object} [overrides]
 */
const register = (browser, overrides = {}) =>
  browser.post('/auth/register', registration(overrides), { 'Idempotency-Key': randomUUID() });

/** Un compte vérifié et connecté, dans un navigateur. */
async function verifiedBrowser() {
  const built = buildApp();
  const browser = createBrowser(built.app);
  await register(browser);
  const token = tokenFrom(built.mailer.to(EMAIL).at(-1), 'verifyEmail');
  await browser.post('/auth/verify-email', { token });
  await browser.login(EMAIL, PASSWORD);
  return { ...built, browser };
}

describe('the auth routes, from registration to sign-out', () => {
  it('register → verify → login → me → refresh → logout, with the shared schemas', async () => {
    const { app, mailer } = buildApp();
    const browser = createBrowser(app);

    const csrf = await request(app).get('/api/v1/auth/csrf');
    expect(csrfTokenResponseSchema.safeParse(csrf.body).success).toBe(true);

    const registered = await register(browser);
    expect(registered.status).toBe(202);
    expect(acceptedResponseSchema.parse(registered.body)).toEqual({ status: 'accepted' });

    const token = tokenFrom(mailer.to(EMAIL).at(-1), 'verifyEmail');
    expect((await browser.post('/auth/verify-email', { token })).status).toBe(200);

    const login = await browser.login(EMAIL, PASSWORD);
    expect(login.status).toBe(200);
    expect(loginResponseSchema.parse(login.body)).toEqual({ accessToken: expect.any(String) });
    expect(login.body).not.toHaveProperty('refreshToken');

    const me = await browser.get('/auth/me');
    expect(currentUserSchema.parse(me.body)).toMatchObject({ email: EMAIL, emailVerified: true });

    const firstRefresh = browser.state.refreshToken;
    const refreshed = await browser.refresh();
    expect(refreshed.status).toBe(200);
    expect(browser.state.refreshToken).not.toBe(firstRefresh);

    const sessions = await browser.get('/auth/sessions');
    expect(authSessionListResponseSchema.parse(sessions.body).sessions).toHaveLength(1);

    expect((await browser.post('/auth/logout')).status).toBe(204);
    expect((await browser.refresh()).status).toBe(401);
  });

  it('sets the refresh token in an HttpOnly, Secure, SameSite=Lax cookie, sent to the refresh route only', async () => {
    const { browser } = await verifiedBrowser();

    const response = await browser.login(EMAIL, PASSWORD);

    const cookie = cookieFrom(response, REFRESH_COOKIE);
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie?.attributes).toMatch(/HttpOnly/);
    expect(cookie?.attributes).toMatch(/Secure/);
    expect(cookie?.attributes).toMatch(/SameSite=Lax/);
    expect(cookie?.attributes).toContain(`Path=${REFRESH_COOKIE_PATH}`);
    expect(cookie?.attributes).toMatch(/Max-Age=2592000/);
  });

  it('never lets a token response be cached or compressed', async () => {
    const { browser } = await verifiedBrowser();

    for (const response of [await browser.login(EMAIL, PASSWORD), await browser.refresh()]) {
      expect(response.headers['cache-control']).toBe('no-store, no-transform');
      expect(response.headers['content-encoding']).toBeUndefined();
    }
  });

  it('clears the refresh cookie when a refresh is refused', async () => {
    const { app } = buildApp();
    const browser = createBrowser(app);
    browser.state.refreshToken = 'A'.repeat(43);

    const response = await browser.refresh();

    expect(response.status).toBe(401);
    expect(cookieFrom(response, REFRESH_COOKIE)?.attributes).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe('forbidden access, route by route', () => {
  it.each([
    ['post', '/auth/register'],
    ['post', '/auth/verify-email'],
    ['post', '/auth/resend-verification'],
    ['post', '/auth/login'],
    ['post', '/auth/refresh'],
    ['post', '/auth/logout'],
    ['post', '/auth/logout-all'],
    ['post', '/auth/forgot-password'],
    ['post', '/auth/reset-password'],
    ['patch', '/auth/me'],
    ['delete', `/auth/sessions/${'a'.repeat(24)}`],
  ])('%s %s without a CSRF token answers 403 CSRF_INVALID', async (method, path) => {
    const { app } = buildApp();

    const response = await /** @type {any} */ (request(app))[method](`/api/v1${path}`).send({});

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CSRF_INVALID');
  });

  it.each([
    ['get', '/auth/me'],
    ['patch', '/auth/me'],
    ['get', '/auth/sessions'],
    ['delete', `/auth/sessions/${'a'.repeat(24)}`],
    ['post', '/auth/logout'],
    ['post', '/auth/logout-all'],
  ])('%s %s without an access token answers 401 UNAUTHENTICATED', async (method, path) => {
    const { app } = buildApp();
    const browser = createBrowser(app);

    const response = await browser.send(/** @type {any} */ (method), path, {
      body: method === 'patch' ? { firstName: 'X' } : undefined,
    });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it('refuses a forged or expired-looking access token', async () => {
    const { app } = buildApp();
    const browser = createBrowser(app);
    // Un JWT bien formé, mais signé par personne : construit ici plutôt qu'écrit en dur.
    const segment = (/** @type {object | string} */ value) =>
      Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
    browser.state.accessToken = [
      segment({ alg: 'HS256' }),
      segment({ sub: 'x' }),
      segment('forged'),
    ].join('.');

    const response = await browser.get('/auth/me');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
  });

  it("cannot revoke another account's session: 404, and the session survives", async () => {
    const owner = await verifiedBrowser();
    const ownerSession = (await owner.browser.get('/auth/sessions')).body.sessions[0].id;
    const intruder = createBrowser(owner.app);
    await register(intruder, { email: 'intrus@exemple.ci' });
    await intruder.post('/auth/verify-email', {
      token: tokenFrom(owner.mailer.to('intrus@exemple.ci').at(-1), 'verifyEmail'),
    });
    await intruder.login('intrus@exemple.ci', PASSWORD);

    const response = await intruder.send('delete', `/auth/sessions/${ownerSession}`);

    expect(response.status).toBe(404);
    expect((await owner.browser.refresh()).status).toBe(200);
  });

  it('refuses a malformed session id before reaching the database', async () => {
    const { browser } = await verifiedBrowser();

    const response = await browser.send('delete', '/auth/sessions/{"$ne":null}');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('an unverified account', () => {
  it('can sign in, read its account, ask for a new link and sign out, but nothing else', async () => {
    const { app } = buildApp();
    const browser = createBrowser(app);
    await register(browser);
    await browser.login(EMAIL, PASSWORD);

    expect((await browser.get('/auth/me')).body.emailVerified).toBe(false);
    expect((await browser.post('/auth/resend-verification', { email: EMAIL })).status).toBe(202);

    for (const response of [
      await browser.get('/auth/sessions'),
      await browser.send('patch', '/auth/me', { body: { firstName: 'X' } }),
      await browser.send('delete', `/auth/sessions/${'a'.repeat(24)}`),
    ]) {
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
    }
    expect((await browser.post('/auth/logout')).status).toBe(204);
  });

  it('gets a verified access token at its next refresh, once the address is verified', async () => {
    const { app, mailer } = buildApp();
    const browser = createBrowser(app);
    await register(browser);
    await browser.login(EMAIL, PASSWORD);
    await browser.post('/auth/verify-email', {
      token: tokenFrom(mailer.to(EMAIL).at(-1), 'verifyEmail'),
    });
    expect((await browser.get('/auth/sessions')).status).toBe(403);

    await browser.refresh();

    expect((await browser.get('/auth/sessions')).status).toBe(200);
  });
});

describe('profile', () => {
  it('updates the allowed fields only', async () => {
    const { browser } = await verifiedBrowser();

    const updated = await browser.send('patch', '/auth/me', {
      body: { firstName: 'Awa Marie', timezone: 'Europe/Paris' },
    });
    const refused = await browser.send('patch', '/auth/me', {
      body: { email: 'autre@exemple.ci' },
    });

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ firstName: 'Awa Marie', timezone: 'Europe/Paris' });
    expect(refused.status).toBe(400);
  });
});
