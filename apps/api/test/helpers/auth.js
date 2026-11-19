import argon2 from 'argon2';
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeAll } from 'vitest';
import { up as createAuthCollections } from '../../migrations/20261119070000-auth-collections.js';
import { createAccessTokens } from '../../src/lib/auth/access-token.js';
import { createPasswordHasher } from '../../src/lib/auth/password-hasher.js';
import { createServiceContext } from '../../src/lib/context/service-context.js';
import { createKeyedHasher } from '../../src/lib/crypto/keyed-hash.js';
import { createSecretBox } from '../../src/lib/crypto/secret-box.js';
import { CSRF_COOKIE, REFRESH_COOKIE } from '../../src/lib/http/cookies.js';
import { createAuthEmails } from '../../src/modules/auth/auth-emails.js';
import { createAuthServices } from '../../src/modules/auth/services/auth-services.js';
import { TEST_SECRETS, createTestLogger } from './app.js';
import { useTestDatabase } from './db.js';
import { createRecordingMailer } from './mail.js';

/**
 * Paramètres argon2id allégés : les tests hachent des centaines de mots de passe. Le format et
 * l'algorithme sont les mêmes qu'en production (voir password-hasher.test.js pour les vrais).
 */
export const FAST_ARGON2 = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 1024,
  timeCost: 1,
  parallelism: 1,
});

export const createFastPasswordHasher = () => createPasswordHasher({ parameters: FAST_ARGON2 });

/**
 * Horloge réglable : les tests avancent dans le temps (expiration d'un jeton, fin d'un
 * verrouillage) sans attendre.
 *
 * @param {Date} [start]
 */
export function createTestClock(start = new Date('2026-11-19T10:00:00.000Z')) {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    /** @param {number} ms */
    advance(ms) {
      current += ms;
    },
  };
}

/** Base de test propre au fichier, avec les collections et index de l'authentification. */
export function useAuthDatabase() {
  useTestDatabase();
  beforeAll(async () => {
    const { db } = mongoose.connection;
    if (!db) {
      throw new Error('useAuthDatabase(): no open MongoDB connection');
    }
    await createAuthCollections(db);
  });
}

/** Services d'authentification avec des dépendances de test. */
export function createTestAuthServices() {
  const clock = createTestClock();
  const mailer = createRecordingMailer();
  const { logger, logs } = createTestLogger();
  const accessTokens = createAccessTokens({ secret: TEST_SECRETS.ACCESS_TOKEN_SECRET, clock });
  const services = createAuthServices({
    clock,
    logger,
    mailer,
    emails: createAuthEmails({ webAppUrl: 'http://localhost:5173' }),
    passwordHasher: createFastPasswordHasher(),
    accessTokens,
    keyedHasher: createKeyedHasher(TEST_SECRETS.HASH_SECRET),
    secretBox: createSecretBox(Buffer.from(TEST_SECRETS.DATA_ENCRYPTION_KEY, 'base64')),
  });
  return { services, clock, mailer, logs, accessTokens };
}

/**
 * Résultat d'une connexion sans 2FA : la session. Lève si la connexion attend un code.
 *
 * @param {import('../../src/modules/auth/services/login.service.js').LoginResult} result
 * @returns {import('../../src/modules/auth/services/session-tokens.js').IssuedTokens}
 */
export function sessionTokens(result) {
  if ('challengeToken' in result) {
    throw new Error('The login expects a second factor');
  }
  return result;
}

/** Contexte d'une requête anonyme, comme le construit le controller. */
export const anonymousContext = (userAgent = 'Mozilla/5.0 (Linux; Android 14) Chrome/131.0') =>
  createServiceContext({ ip: '203.0.113.7', userAgent });

/**
 * @param {string} userId
 * @param {string} authSessionId
 */
export const userContext = (userId, authSessionId) =>
  createServiceContext({ userId, authSessionId, ip: '203.0.113.7', userAgent: 'Test' });

/** Une inscription valide ; `overrides` change un champ. */
export function registration(overrides = {}) {
  return {
    email: 'awa.kone@exemple.ci',
    password: 'Le soleil se lève sur la lagune',
    firstName: 'Awa',
    lastName: 'Koné',
    accountType: /** @type {const} */ ('individual'),
    locale: /** @type {const} */ ('fr'),
    timezone: 'Africa/Abidjan',
    ...overrides,
  };
}

/**
 * Valeur d'un cookie posé par une réponse (Set-Cookie), ou undefined. Supertest n'envoie pas
 * les cookies Secure en HTTP : les tests les relisent et les renvoient eux-mêmes.
 *
 * @param {import('supertest').Response} response
 * @param {string} name
 * @returns {{ value: string, attributes: string } | undefined}
 */
export function cookieFrom(response, name) {
  const header = response.headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const found = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  if (!found) {
    return undefined;
  }
  const [pair = '', ...attributes] = found.split(';');
  return {
    value: decodeURIComponent(pair.slice(name.length + 1)),
    attributes: attributes.join(';'),
  };
}

/**
 * Client HTTP d'un navigateur : il garde le jeton CSRF (en-tête et cookie), le refresh token
 * (cookie) et l'access token (mémoire), et les renvoie comme le ferait l'application web.
 *
 * @param {import('express').Express} app
 */
export function createBrowser(app) {
  const state = {
    /** @type {string | undefined} */ csrf: undefined,
    /** @type {string | undefined} */ refreshToken: undefined,
    /** @type {string | undefined} */ accessToken: undefined,
  };

  async function ensureCsrf() {
    if (!state.csrf) {
      const response = await request(app).get('/api/v1/auth/csrf');
      state.csrf = response.body.csrfToken;
    }
    return /** @type {string} */ (state.csrf);
  }

  /** @param {import('supertest').Response} response */
  function remember(response) {
    const refresh = cookieFrom(response, REFRESH_COOKIE);
    if (refresh) {
      state.refreshToken = refresh.value || undefined;
    }
    if (typeof response.body?.accessToken === 'string') {
      state.accessToken = response.body.accessToken;
    }
    return response;
  }

  /**
   * @param {'post' | 'patch' | 'delete' | 'get'} method
   * @param {string} path Relatif à /api/v1.
   * @param {{ body?: object, refreshCookie?: boolean, headers?: Record<string, string>, bearer?: boolean }} [options]
   */
  async function send(
    method,
    path,
    { body, refreshCookie = false, headers = {}, bearer = true } = {},
  ) {
    const csrf = method === 'get' ? undefined : await ensureCsrf();
    const cookies = [
      ...(csrf ? [`${CSRF_COOKIE}=${csrf}`] : []),
      ...(refreshCookie && state.refreshToken ? [`${REFRESH_COOKIE}=${state.refreshToken}`] : []),
    ];
    let pending = request(app)[method](`/api/v1${path}`);
    if (csrf) {
      pending = pending.set('X-CSRF-Token', csrf);
    }
    if (cookies.length > 0) {
      pending = pending.set('Cookie', cookies.join('; '));
    }
    if (bearer && state.accessToken) {
      pending = pending.set('Authorization', `Bearer ${state.accessToken}`);
    }
    for (const [name, value] of Object.entries(headers)) {
      pending = pending.set(name, value);
    }
    return remember(await (body === undefined ? pending : pending.send(body)));
  }

  return {
    state,
    send,
    /** @param {string} path @param {object} [body] @param {Record<string, string>} [headers] */
    post: (path, body, headers) => send('post', path, { body, headers }),
    /** @param {string} path */
    get: (path) => send('get', path),
    refresh: () => send('post', '/auth/refresh', { refreshCookie: true, bearer: false }),
    /** @param {string} email @param {string} password */
    login: (email, password) => send('post', '/auth/login', { body: { email, password } }),
  };
}
