import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildPipelineApp } from '../../../test/helpers/app.js';
import { createTestClock, useAuthDatabase } from '../../../test/helpers/auth.js';
import { createKeyedHasher } from '../crypto/keyed-hash.js';
import { createIdempotency } from '../idempotency/idempotent.js';
import { IdempotencyKey } from '../idempotency/idempotency-key.model.js';
import { CSRF_COOKIE } from './cookies.js';
import { createCsrfProtection } from './csrf.js';

const keyedHasher = createKeyedHasher(randomBytes(32).toString('base64'));

describe('CSRF protection (signed double submit)', () => {
  const csrf = createCsrfProtection({ keyedHasher, cookieDomain: undefined });
  const { app } = buildPipelineApp((router) => {
    router.get('/csrf', (req, res) => {
      res.json({ csrfToken: csrf.issue(req, res) });
    });
    router.post('/change', csrf.requireCsrf(), (_req, res) => {
      res.json({ changed: true });
    });
    router.get('/read', csrf.requireCsrf(), (_req, res) => {
      res.json({ read: true });
    });
  });

  async function issue() {
    const response = await request(app).get('/csrf');
    return { token: response.body.csrfToken, setCookie: String(response.headers['set-cookie']) };
  }

  it('sets the token in an HttpOnly, Secure, SameSite=Lax cookie, and returns it in the body', async () => {
    const { token, setCookie } = await issue();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
    expect(setCookie).toContain(`${CSRF_COOKIE}=${token}`);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(setCookie).toMatch(/Path=\/api\/v1/);
  });

  it('accepts a state-changing request whose header matches the cookie', async () => {
    const { token } = await issue();

    const response = await request(app)
      .post('/change')
      .set('Cookie', `${CSRF_COOKIE}=${token}`)
      .set('X-CSRF-Token', token);

    expect(response.status).toBe(200);
  });

  it('refuses a request without the header, without the cookie, or with a mismatch (forbidden access)', async () => {
    const { token } = await issue();
    const { token: other } = await issue();

    const attempts = [
      request(app).post('/change').set('Cookie', `${CSRF_COOKIE}=${token}`),
      request(app).post('/change').set('X-CSRF-Token', token),
      request(app)
        .post('/change')
        .set('Cookie', `${CSRF_COOKIE}=${token}`)
        .set('X-CSRF-Token', other),
    ];

    for (const response of await Promise.all(attempts)) {
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('CSRF_INVALID');
    }
  });

  it('refuses a token forged without the secret, even when header and cookie match', async () => {
    const forged = `${'A'.repeat(43)}.${'B'.repeat(43)}`;
    const otherServer = createCsrfProtection({
      keyedHasher: createKeyedHasher(randomBytes(32).toString('base64')),
      cookieDomain: undefined,
    });
    const { app: otherApp } = buildPipelineApp((router) => {
      router.get('/csrf', (req, res) => {
        res.json({ csrfToken: otherServer.issue(req, res) });
      });
    });
    const foreign = (await request(otherApp).get('/csrf')).body.csrfToken;

    for (const token of [forged, foreign, 'no-dot']) {
      const response = await request(app)
        .post('/change')
        .set('Cookie', `${CSRF_COOKIE}=${token}`)
        .set('X-CSRF-Token', token);
      expect(response.status).toBe(403);
    }
  });

  it('returns the token of an authentic cookie, so that every tab shares it', async () => {
    const { token } = await issue();

    const again = await request(app).get('/csrf').set('Cookie', `${CSRF_COOKIE}=${token}`);
    const forged = await request(app)
      .get('/csrf')
      .set('Cookie', `${CSRF_COOKIE}=${'A'.repeat(43)}.${'B'.repeat(43)}`);

    expect(again.body.csrfToken).toBe(token);
    expect(again.headers['set-cookie']).toBeUndefined();
    expect(forged.body.csrfToken).not.toContain('A'.repeat(43));
    expect(String(forged.headers['set-cookie'])).toContain(forged.body.csrfToken);
  });

  it('lets a read-only request through without a token', async () => {
    expect((await request(app).get('/read')).status).toBe(200);
  });
});

describe('idempotency (Idempotency-Key)', () => {
  useAuthDatabase();

  /** @param {{ fail?: boolean }} [options] */
  function buildApp({ fail = false } = {}) {
    const { logger } = buildPipelineApp(() => {});
    const idempotency = createIdempotency({ keyedHasher, clock: createTestClock(), logger });
    let executions = 0;
    const built = buildPipelineApp((router) => {
      router.post(
        '/orders',
        idempotency.idempotent({ scope: 'POST /orders', fingerprint: (req) => req.body }),
        async (req, res) => {
          executions += 1;
          await new Promise((resolve) => setTimeout(resolve, 30));
          if (fail) {
            throw new Error('database down');
          }
          res.status(201).json({ order: executions, item: req.body.item });
        },
      );
    });
    return { app: built.app, executions: () => executions };
  }

  it('runs the first request and replays its answer for the same key', async () => {
    const { app, executions } = buildApp();
    const key = randomUUID();

    const first = await request(app)
      .post('/orders')
      .set('Idempotency-Key', key)
      .send({ item: 'a' });
    const second = await request(app)
      .post('/orders')
      .set('Idempotency-Key', key)
      .send({ item: 'a' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(second.headers['idempotency-replayed']).toBe('true');
    expect(executions()).toBe(1);
  });

  it('runs only one of several simultaneous requests with the same key (race)', async () => {
    const { app, executions } = buildApp();
    const key = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post('/orders').set('Idempotency-Key', key).send({ item: 'a' }),
      ),
    );

    // Une seule exécution. Chaque réponse est soit son résultat (direct ou rejoué), soit
    // « encore en cours » pour une requête arrivée pendant l'exécution.
    expect(executions()).toBe(1);
    const results = responses.filter((response) => response.status === 201);
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const result of results) {
      expect(result.body).toEqual({ order: 1, item: 'a' });
    }
    for (const response of responses.filter((item) => item.status !== 201)) {
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('IDEMPOTENCY_CONFLICT');
    }
  });

  it('refuses the same key for a different request', async () => {
    const { app } = buildApp();
    const key = randomUUID();

    await request(app).post('/orders').set('Idempotency-Key', key).send({ item: 'a' });
    const reused = await request(app)
      .post('/orders')
      .set('Idempotency-Key', key)
      .send({ item: 'b' });

    expect(reused.status).toBe(409);
    expect(reused.body.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('releases the key after a server error, so the request can be retried', async () => {
    const { app } = buildApp({ fail: true });
    const key = randomUUID();

    const failed = await request(app)
      .post('/orders')
      .set('Idempotency-Key', key)
      .send({ item: 'a' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(failed.status).toBe(500);
    expect(await IdempotencyKey.countDocuments({ scope: 'POST /orders', key })).toBe(0);
  });

  it.each([undefined, 'short', 'with spaces in the key!'])(
    'refuses a missing or malformed key (%s)',
    async (key) => {
      const { app, executions } = buildApp();
      const pending = request(app).post('/orders');
      const response = await (key ? pending.set('Idempotency-Key', key) : pending).send({
        item: 'a',
      });

      expect(response.status).toBe(400);
      expect(response.body.details.issues[0].path).toBe('Idempotency-Key');
      expect(executions()).toBe(0);
    },
  );

  it('stores a keyed fingerprint, never the request itself', async () => {
    const { app } = buildApp();
    const key = randomUUID();

    await request(app).post('/orders').set('Idempotency-Key', key).send({ item: 'secret-item' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const stored = await IdempotencyKey.findOne({ scope: 'POST /orders', key }).lean();
    expect(stored?.fingerprint).not.toContain('secret-item');
    expect(stored?.status).toBe('completed');
  });
});
