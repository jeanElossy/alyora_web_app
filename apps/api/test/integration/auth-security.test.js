import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { REFRESH_COOKIE } from '../../src/lib/http/cookies.js';
import { LOCK_BASE_MS, LOCK_THRESHOLD } from '../../src/modules/auth/services/login.service.js';
import { buildTestApp, createTestConfig } from '../helpers/app.js';
import {
  createBrowser,
  createFastPasswordHasher,
  createTestClock,
  registration,
  useAuthDatabase,
} from '../helpers/auth.js';
import { tokenFrom, waitForMail } from '../helpers/mail.js';

useAuthDatabase();

const EMAIL = 'awa.kone@exemple.ci';
const PASSWORD = 'Le soleil se lève sur la lagune';
const NEW_PASSWORD = 'Les pirogues rentrent au port';

/** @param {{ clock?: ReturnType<typeof createTestClock> }} [options] */
function buildApp({ clock } = {}) {
  return buildTestApp({ passwordHasher: createFastPasswordHasher(), ...(clock ? { clock } : {}) });
}

/**
 * @param {ReturnType<typeof buildApp>} built
 * @param {string} [email]
 */
async function verifiedAccount(built, email = EMAIL) {
  const browser = createBrowser(built.app);
  await browser.post('/auth/register', registration({ email }), {
    'Idempotency-Key': randomUUID(),
  });
  await browser.post('/auth/verify-email', {
    token: tokenFrom(built.mailer.to(email).at(-1), 'verifyEmail'),
  });
  return browser;
}

describe('required tests of M0.4', () => {
  it('a replayed refresh token invalidates the whole family', async () => {
    const built = buildApp();
    const browser = await verifiedAccount(built);
    await browser.login(EMAIL, PASSWORD);
    const stolen = browser.state.refreshToken;
    await browser.refresh();
    const legitimate = browser.state.refreshToken;

    // L'attaquant rejoue le jeton volé, déjà consommé.
    const attacker = createBrowser(built.app);
    attacker.state.refreshToken = stolen;
    expect((await attacker.refresh()).status).toBe(401);

    // Le titulaire, avec le dernier jeton émis, doit se reconnecter lui aussi.
    browser.state.refreshToken = legitimate;
    const owner = await browser.refresh();
    expect(owner.status).toBe(401);
    expect(owner.body.code).toBe('UNAUTHENTICATED');
    expect(built.logs.text()).toContain('Refresh token reuse detected');
    expect(built.logs.text()).not.toContain(String(stolen));
  });

  it('locks the account after repeated failures, and unlocks it on its own', async () => {
    const clock = createTestClock();
    // Derrière un proxy (TRUST_PROXY=1), l'IP cliente vient de X-Forwarded-For.
    const built = buildTestApp({
      config: createTestConfig({ TRUST_PROXY: '1' }),
      passwordHasher: createFastPasswordHasher(),
      clock,
    });
    await verifiedAccount(built);

    // 5 essais par 15 minutes et par couple IP + adresse : chaque série vient d'une autre IP,
    // pour atteindre les 10 échecs du verrouillage.
    for (let failure = 0; failure < LOCK_THRESHOLD; failure += 1) {
      const response = await createBrowser(built.app).send('post', '/auth/login', {
        body: { email: EMAIL, password: 'mauvais mot de passe' },
        headers: { 'X-Forwarded-For': `198.51.100.${failure}` },
      });
      expect(response.body.code).toBe('INVALID_CREDENTIALS');
    }

    const locked = await createBrowser(built.app).login(EMAIL, PASSWORD);
    expect(locked.status).toBe(401);
    expect(locked.body.code).toBe('INVALID_CREDENTIALS');

    clock.advance(LOCK_BASE_MS + 1000);
    expect((await createBrowser(built.app).login(EMAIL, PASSWORD)).status).toBe(200);
  });

  it('a reset token works only once', async () => {
    const built = buildApp();
    const browser = await verifiedAccount(built);
    await browser.post('/auth/forgot-password', { email: EMAIL });
    // La route répond avant d'envoyer l'e-mail. Le 1er reçu est celui de vérification, puis celui-ci.
    const token = tokenFrom(await waitForMail(built.mailer, EMAIL, 2), 'resetPassword');

    const first = await browser.post('/auth/reset-password', { token, password: NEW_PASSWORD });
    const second = await browser.post('/auth/reset-password', {
      token,
      password: 'Encore un autre mot de passe',
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(second.body.code).toBe('INVALID_TOKEN');
    expect((await browser.login(EMAIL, NEW_PASSWORD)).status).toBe(200);
  });

  it('an unverified account cannot reach the protected routes', async () => {
    const built = buildApp();
    const browser = createBrowser(built.app);
    await browser.post('/auth/register', registration(), { 'Idempotency-Key': randomUUID() });
    await browser.login(EMAIL, PASSWORD);

    const response = await browser.get('/auth/sessions');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Email address not verified',
      details: {},
    });
  });

  it('answers a login identically for an unknown address and a wrong password', async () => {
    const built = buildApp();
    await verifiedAccount(built);
    // Une application fraîche par essai : mêmes compteurs de limite, mêmes en-têtes.
    const attempt = async (/** @type {string} */ email) => {
      const fresh = buildTestApp({ passwordHasher: createFastPasswordHasher() });
      const started = performance.now();
      const response = await createBrowser(fresh.app).login(email, 'pas le bon mot de passe');
      return { response, duration: performance.now() - started };
    };

    const unknown = await attempt('personne@exemple.ci');
    const wrong = await attempt(EMAIL);

    expect(unknown.response.status).toBe(wrong.response.status);
    expect(unknown.response.body).toEqual(wrong.response.body);
    expect(unknown.response.body).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials',
      details: {},
    });
    // Seuls diffèrent la date, l'identifiant de corrélation, et la clé de partition (pk) de la
    // limite par adresse : une empreinte de l'adresse saisie, différente pour deux adresses
    // quelconques, que l'une ait un compte ou non. Elle ne dit rien de l'existence d'un compte.
    /** @param {import('supertest').Response} response */
    const stableHeaders = (response) =>
      Object.fromEntries(
        Object.entries(response.headers)
          .filter(([name]) => !['date', 'x-request-id'].includes(name))
          .map(([name, value]) => [name, String(value).replace(/pk=:[^:]*:/g, 'pk=:…:')]),
      );
    expect(stableHeaders(unknown.response)).toEqual(stableHeaders(wrong.response));
    // Même ordre de grandeur de durée : un hash est vérifié dans les deux cas.
    const durations = [];
    for (let round = 0; round < 5; round += 1) {
      durations.push([
        (await attempt('personne@exemple.ci')).duration,
        (await attempt(EMAIL)).duration,
      ]);
    }
    const median = (/** @type {number[]} */ values) => values.sort((a, b) => a - b)[2] ?? 0;
    const ratio = median(durations.map(([a]) => a ?? 0)) / median(durations.map(([, b]) => b ?? 0));
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(2.5);
  });

  it('a revoked session can no longer refresh', async () => {
    const built = buildApp();
    const phone = await verifiedAccount(built);
    await phone.login(EMAIL, PASSWORD);
    const laptop = createBrowser(built.app);
    await laptop.login(EMAIL, PASSWORD);
    const phoneSession = (await phone.get('/auth/sessions')).body.sessions.find(
      (/** @type {{ current: boolean }} */ session) => session.current,
    ).id;

    expect((await laptop.send('delete', `/auth/sessions/${phoneSession}`)).status).toBe(204);

    expect((await phone.refresh()).status).toBe(401);
    expect((await laptop.refresh()).status).toBe(200);
  });
});

describe('rate limits and idempotency', () => {
  it('allows 5 login attempts per 15 minutes for an address from one IP', async () => {
    const built = buildApp();
    await verifiedAccount(built);
    const statuses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push((await createBrowser(built.app).login(EMAIL, 'mauvais mot de passe')).status);
    }

    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    // Une autre adresse, depuis la même IP, n'est pas bloquée.
    expect((await createBrowser(built.app).login('autre@exemple.ci', 'x')).status).toBe(401);
  });

  it('allows 3 password reset requests per hour for an address from one IP', async () => {
    const built = buildApp();
    const browser = createBrowser(built.app);
    const statuses = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      statuses.push((await browser.post('/auth/forgot-password', { email: EMAIL })).status);
    }

    expect(statuses).toEqual([202, 202, 202, 429]);
  });

  it('replays a registration sent twice with the same Idempotency-Key, and refuses one without', async () => {
    const built = buildApp();
    const browser = createBrowser(built.app);
    const key = randomUUID();

    const first = await browser.post('/auth/register', registration(), { 'Idempotency-Key': key });
    const replay = await browser.post('/auth/register', registration(), { 'Idempotency-Key': key });
    const missing = await browser.post('/auth/register', registration());

    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(built.mailer.to(EMAIL)).toHaveLength(1);
    expect(missing.status).toBe(400);
  });

  it('answers a password reset request before looking the address up, identically for any address', async () => {
    const built = buildApp();
    await verifiedAccount(built);
    // La file ne répond plus : la réponse n'en dépend pas, l'échec est seulement journalisé.
    built.mailer.failing = true;

    const known = await createBrowser(built.app).post('/auth/forgot-password', { email: EMAIL });
    const unknown = await createBrowser(built.app).post('/auth/forgot-password', {
      email: 'personne@exemple.ci',
    });

    expect(known.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    await vi.waitFor(() => expect(built.logs.text()).toContain('Unable to queue an email'));
    expect(built.logs.text()).not.toContain(EMAIL);
  });

  it('answers a registration identically whether the address is free or taken', async () => {
    const built = buildApp();
    await verifiedAccount(built);

    const taken = await createBrowser(built.app).post('/auth/register', registration(), {
      'Idempotency-Key': randomUUID(),
    });
    const free = await createBrowser(built.app).post(
      '/auth/register',
      registration({ email: 'libre@exemple.ci' }),
      { 'Idempotency-Key': randomUUID() },
    );

    expect(taken.status).toBe(free.status);
    expect(taken.body).toEqual(free.body);
  });
});

describe('leaks', () => {
  it('writes no password, token, cookie or address in the logs of a whole journey', async () => {
    const built = buildApp();
    const browser = await verifiedAccount(built);
    await browser.login(EMAIL, PASSWORD);
    await browser.refresh();
    await browser.post('/auth/forgot-password', { email: EMAIL });
    const resetToken = tokenFrom(await waitForMail(built.mailer, EMAIL, 2), 'resetPassword');
    await browser.post('/auth/reset-password', { token: resetToken, password: NEW_PASSWORD });
    await browser.login(EMAIL, 'mauvais mot de passe');

    const logs = built.logs.text();
    for (const secret of [
      PASSWORD,
      NEW_PASSWORD,
      EMAIL,
      resetToken,
      String(browser.state.refreshToken),
      String(browser.state.accessToken),
      String(browser.state.csrf),
      REFRESH_COOKIE,
    ]) {
      expect(logs).not.toContain(secret);
    }
  });
});
