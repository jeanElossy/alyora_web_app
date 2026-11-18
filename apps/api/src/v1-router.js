import express from 'express';
import { globalRateLimiter } from './lib/http/rate-limit.js';
import { buildOpenApiDocument } from './lib/openapi/build-document.js';
import { mountRoutes } from './lib/openapi/registry.js';
import { SYSTEM_ROUTES, createDocsRouter } from './modules/system/system.routes.js';

export const API_V1_PREFIX = '/api/v1';

/** Toutes les routes /api/v1 documentées. Chaque module ajoute ici ses définitions de routes. */
export const V1_ROUTES = Object.freeze([...SYSTEM_ROUTES]);

/**
 * @param {object} deps
 * @param {import('./config/load-config.js').AppConfig} deps.config
 * @param {import('pino').Logger} deps.logger
 * @param {import('express-rate-limit').Store} deps.rateLimitStore
 */
export function createV1Router({ config, logger, rateLimitStore }) {
  const router = express.Router();
  router.use(globalRateLimiter({ store: rateLimitStore, logger }));
  mountRoutes(router, V1_ROUTES);
  if (!config.isProduction) {
    const document = buildOpenApiDocument({
      title: 'ALYORA API',
      version: 'v1',
      basePath: API_V1_PREFIX,
      routes: V1_ROUTES,
    });
    router.use(createDocsRouter(document));
  }
  return router;
}
