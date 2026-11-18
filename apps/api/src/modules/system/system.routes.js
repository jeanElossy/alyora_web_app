import { pingResponseSchema } from '@alyora/shared';
import express from 'express';
import { defineRoute } from '../../lib/openapi/registry.js';
import { health, openApiDocument, ping, readiness } from './system.controller.js';

/** Routes du module system montées sous /api/v1, et documentées. */
export const SYSTEM_ROUTES = Object.freeze([
  defineRoute({
    method: 'get',
    path: '/ping',
    summary: 'Checks that the API v1 router answers',
    tags: ['system'],
    responses: { 200: { description: 'The API answers', schema: pingResponseSchema } },
    handler: ping,
  }),
]);

/**
 * Sondes de la plateforme, montées à la racine (hors /api/v1) et jamais soumises au rate limit.
 *
 * @param {object} deps
 * @param {import('../../lib/health/readiness.js').ReadinessChecks} deps.readinessChecks
 * @param {import('pino').Logger} deps.logger
 */
export function createProbesRouter({ readinessChecks, logger }) {
  const router = express.Router();
  router.get('/health', health);
  router.get('/ready', readiness({ checks: readinessChecks, logger }));
  return router;
}

/**
 * Route du document OpenAPI. Montée hors production seulement.
 *
 * @param {Record<string, unknown>} document
 */
export function createDocsRouter(document) {
  const router = express.Router();
  router.get('/docs', openApiDocument(document));
  return router;
}
