import express from 'express';
import { assignCorrelationId, bindRequestContext, httpLogger } from './lib/http/correlation.js';
import { errorHandler } from './lib/http/error-handler.js';
import { notFound } from './lib/http/not-found.js';
import {
  corsWhitelist,
  jsonBody,
  responseCompression,
  securityHeaders,
} from './lib/http/security.js';
import { createProbesRouter } from './modules/system/system.routes.js';
import { API_V1_PREFIX, createV1Router } from './v1-router.js';

/**
 * @typedef {object} AppDependencies
 * @property {import('./config/load-config.js').AppConfig} config
 * @property {import('pino').Logger} logger
 * @property {import('./lib/health/readiness.js').ReadinessChecks} readinessChecks
 * @property {import('express-rate-limit').Store} rateLimitStore Limite globale de /api/v1.
 * @property {(name: string) => import('express-rate-limit').Store} createRateLimitStore
 *   Stockage d'une limite nommée (connexion, inscription...).
 * @property {import('./lib/mail/mail-queue.js').Mailer} mailer
 * @property {{ now: () => Date }} [clock]
 * @property {import('./lib/auth/password-hasher.js').PasswordHasher} [passwordHasher]
 */

/**
 * Construit l'application Express. N'ouvre rien et n'écoute rien : les connexions et listen()
 * appartiennent à bootstrap.js, si bien que l'application se teste avec Supertest.
 *
 * @param {AppDependencies} deps
 * @returns {import('express').Express}
 */
export function createApp(deps) {
  const app = express();
  applyCoreMiddleware(app, deps);
  app.use(createProbesRouter(deps));
  app.use(API_V1_PREFIX, createV1Router(deps));
  applyErrorHandling(app, deps);
  return app;
}

/**
 * Middlewares que traverse chaque requête, dans cet ordre. Exportés pour que les tests puissent
 * construire une application avec exactement la même chaîne autour d'une route de test.
 *
 * @param {import('express').Express} app
 * @param {Pick<AppDependencies, 'config' | 'logger'>} deps
 */
export function applyCoreMiddleware(app, { config, logger }) {
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(assignCorrelationId());
  app.use(httpLogger(logger));
  app.use(securityHeaders());
  app.use(corsWhitelist(config.cors.origins));
  app.use(responseCompression());
  app.use(jsonBody());
  app.use(bindRequestContext());
}

/**
 * Doit venir après toutes les routes.
 *
 * @param {import('express').Express} app
 * @param {Pick<AppDependencies, 'logger'>} deps
 */
export function applyErrorHandling(app, { logger }) {
  app.use(notFound());
  app.use(errorHandler({ logger }));
}
