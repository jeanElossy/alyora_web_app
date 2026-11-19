import { createAccessTokens } from '../../lib/auth/access-token.js';
import { createPasswordHasher } from '../../lib/auth/password-hasher.js';
import { createAuthGuards } from '../../lib/auth/require-auth.js';
import { createKeyedHasher } from '../../lib/crypto/keyed-hash.js';
import { createCsrfProtection } from '../../lib/http/csrf.js';
import { createIdempotency } from '../../lib/idempotency/idempotent.js';
import { createAuthEmails } from './auth-emails.js';
import { createAuthRateLimits } from './auth-rate-limits.js';
import { createAuthController } from './auth.controller.js';
import { createAuthRoutes } from './auth.routes.js';
import { createAuthServices } from './services/auth-services.js';

/** Horloge du système ; les tests en injectent une autre pour avancer dans le temps. */
export const systemClock = Object.freeze({ now: () => new Date() });

/**
 * @typedef {object} AuthModuleDependencies
 * @property {import('../../config/load-config.js').AppConfig} config
 * @property {import('pino').Logger} logger
 * @property {import('../../lib/mail/mail-queue.js').Mailer} mailer
 * @property {(name: string) => import('express-rate-limit').Store} createRateLimitStore
 * @property {{ now: () => Date }} [clock]
 * @property {import('../../lib/auth/password-hasher.js').PasswordHasher} [passwordHasher]
 */

/**
 * Assemble le module d'authentification : services, gardes, routes. Les gardes (requireAuth)
 * sont exposées pour les autres modules.
 *
 * @param {AuthModuleDependencies} deps
 */
export function createAuthModule({
  config,
  logger,
  mailer,
  createRateLimitStore,
  clock = systemClock,
  passwordHasher = createPasswordHasher(),
}) {
  const keyedHasher = createKeyedHasher(config.auth.hashSecret);
  const accessTokens = createAccessTokens({ secret: config.auth.accessTokenSecret, clock });
  const guards = createAuthGuards({ accessTokens });
  const csrf = createCsrfProtection({ keyedHasher, cookieDomain: config.auth.cookieDomain });
  const services = createAuthServices({
    clock,
    logger,
    mailer,
    emails: createAuthEmails({ webAppUrl: config.auth.webAppUrl }),
    passwordHasher,
    accessTokens,
    keyedHasher,
  });
  const routes = createAuthRoutes({
    controller: createAuthController({
      services,
      csrf,
      cookieDomain: config.auth.cookieDomain,
      logger,
    }),
    guards,
    csrf,
    idempotency: createIdempotency({ keyedHasher, clock, logger }),
    limits: createAuthRateLimits({ createStore: createRateLimitStore, keyedHasher, logger }),
  });
  return { routes, guards, services, accessTokens };
}

/** @typedef {ReturnType<typeof createAuthModule>} AuthModule */
