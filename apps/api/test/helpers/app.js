import express from 'express';
import { MemoryStore } from 'express-rate-limit';
import { applyCoreMiddleware, applyErrorHandling, createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/load-config.js';
import { createLogger } from '../../src/lib/logger/create-logger.js';
import { createLogCapture } from './log-capture.js';

/** @typedef {import('../../src/config/load-config.js').AppConfig} AppConfig */

/**
 * Configuration construite par le vrai chargeur, comme en production.
 *
 * @param {Record<string, string>} [overrides] Variables d'environnement.
 * @returns {AppConfig}
 */
export function createTestConfig(overrides = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/unused',
    REDIS_URL: 'redis://127.0.0.1:6379',
    ...overrides,
  }).config;
}

/** Logger au niveau le plus verbeux, qui écrit dans une capture en mémoire. */
export function createTestLogger() {
  const logs = createLogCapture();
  const logger = createLogger({
    level: 'trace',
    service: 'api-test',
    destination: logs.destination,
  });
  return { logger, logs };
}

/**
 * La vraie application, avec des dépendances en mémoire : des vérifications de disponibilité
 * qui réussissent et un stockage de rate limit en mémoire.
 *
 * @param {object} [options]
 * @param {AppConfig} [options.config]
 * @param {import('../../src/lib/health/readiness.js').ReadinessChecks} [options.readinessChecks]
 * @param {import('express-rate-limit').Store} [options.rateLimitStore]
 */
export function buildTestApp({
  config = createTestConfig(),
  readinessChecks = { mongo: async () => {}, redis: async () => {} },
  rateLimitStore = new MemoryStore(),
} = {}) {
  const { logger, logs } = createTestLogger();
  const app = createApp({ config, logger, readinessChecks, rateLimitStore });
  return { app, logger, logs };
}

/**
 * Une application avec la chaîne de middlewares et la gestion d'erreurs de production, autour
 * de routes qui n'existent que dans les tests (un handler qui lève une erreur, un corps validé...).
 *
 * @param {(app: import('express').Express, logger: import('pino').Logger) => void} mount
 * @param {{ config?: AppConfig }} [options]
 */
export function buildPipelineApp(mount, { config = createTestConfig() } = {}) {
  const { logger, logs } = createTestLogger();
  const app = express();
  applyCoreMiddleware(app, { config, logger });
  mount(app, logger);
  applyErrorHandling(app, { logger });
  return { app, logger, logs };
}
