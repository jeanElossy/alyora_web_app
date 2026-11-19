import express from 'express';
import { globalRateLimiter } from './lib/http/rate-limit.js';
import { buildOpenApiDocument } from './lib/openapi/build-document.js';
import { mountRoutes } from './lib/openapi/registry.js';
import { createAuthModule } from './modules/auth/auth-module.js';
import { SYSTEM_ROUTES, createDocsRouter } from './modules/system/system.routes.js';

export const API_V1_PREFIX = '/api/v1';

/**
 * @typedef {object} V1Dependencies
 * @property {import('./config/load-config.js').AppConfig} config
 * @property {import('pino').Logger} logger
 * @property {import('express-rate-limit').Store} rateLimitStore Limite globale.
 * @property {(name: string) => import('express-rate-limit').Store} createRateLimitStore
 *   Stockage d'une limite nommée (une par politique).
 * @property {import('./lib/mail/mail-queue.js').Mailer} mailer
 * @property {{ now: () => Date }} [clock]
 * @property {import('./lib/auth/password-hasher.js').PasswordHasher} [passwordHasher]
 */

/**
 * Toutes les routes /api/v1, documentées. Chaque module ajoute ici les siennes.
 *
 * @param {V1Dependencies} deps
 */
export function buildV1Routes(deps) {
  const auth = createAuthModule(deps);
  return Object.freeze([...SYSTEM_ROUTES, ...auth.routes]);
}

/** @param {V1Dependencies} deps */
export function createV1Router(deps) {
  const { config, logger, rateLimitStore } = deps;
  const router = express.Router();
  router.use(globalRateLimiter({ store: rateLimitStore, logger }));
  const routes = buildV1Routes(deps);
  mountRoutes(router, routes);
  if (!config.isProduction) {
    const document = buildOpenApiDocument({
      title: 'ALYORA API',
      version: 'v1',
      basePath: API_V1_PREFIX,
      routes,
    });
    router.use(createDocsRouter(document));
  }
  return router;
}
