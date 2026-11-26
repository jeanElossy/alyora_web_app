import { createAccessTokens } from '../../lib/auth/access-token.js';
import { createPasswordHasher } from '../../lib/auth/password-hasher.js';
import { createAuthGuards, getAuth } from '../../lib/auth/require-auth.js';
import { createKeyedHasher } from '../../lib/crypto/keyed-hash.js';
import { createSecretBox } from '../../lib/crypto/secret-box.js';
import { AppError } from '../../lib/errors/app-error.js';
import { createCsrfProtection } from '../../lib/http/csrf.js';
import { createIdempotency } from '../../lib/idempotency/idempotent.js';
import { createAuthEmails } from './auth-emails.js';
import { createAuthRateLimits } from './auth-rate-limits.js';
import { createAuthController } from './auth.controller.js';
import { createAuthRoutes } from './auth.routes.js';
import { createAuthServices } from './services/auth-services.js';
import { createTwoFactorController } from './two-factor.controller.js';
import { createTwoFactorRoutes } from './two-factor.routes.js';

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
 * Assemble le module d'authentification : services, gardes, routes. Les gardes (requireAuth,
 * requireRecentAuth, requireTwoFactorEnabled) et la protection CSRF sont exposées pour les
 * autres modules.
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
  const guards = createAuthGuards({ accessTokens, clock });
  const csrf = createCsrfProtection({ keyedHasher, cookieDomain: config.auth.cookieDomain });
  const services = createAuthServices({
    clock,
    logger,
    mailer,
    emails: createAuthEmails({ webAppUrl: config.auth.webAppUrl }),
    passwordHasher,
    accessTokens,
    keyedHasher,
    secretBox: createSecretBox(config.auth.dataEncryptionKey),
  });
  const controller = createAuthController({
    services,
    csrf,
    cookieDomain: config.auth.cookieDomain,
    logger,
  });
  // Une seule instance des limites : les routes qui partagent une limite partagent ses compteurs.
  const limits = createAuthRateLimits({ createStore: createRateLimitStore, keyedHasher, logger });
  const routes = Object.freeze([
    ...createAuthRoutes({
      controller,
      guards,
      csrf,
      idempotency: createIdempotency({ keyedHasher, clock, logger }),
      limits,
    }),
    ...createTwoFactorRoutes({
      controller: createTwoFactorController({ services, auth: controller }),
      guards,
      csrf,
      limits,
    }),
  ]);
  return {
    routes,
    guards: {
      ...guards,
      /**
       * Exige la double authentification active sur le compte (TWO_FACTOR_REQUIRED sinon). Avec
       * requireRecentAuth, elle garantit un second facteur récent : la réauthentification
       * demande alors le code. À placer après requireAuth.
       *
       * @returns {import('express').RequestHandler}
       */
      requireTwoFactorEnabled() {
        return async (req, _res, next) => {
          if (!(await services.twoFactor.isEnabled(getAuth(req).userId))) {
            throw new AppError('TWO_FACTOR_REQUIRED');
          }
          next();
        };
      },
    },
    csrf,
    services,
    accessTokens,
    keyedHasher,
  };
}

/** @typedef {ReturnType<typeof createAuthModule>} AuthModule */
