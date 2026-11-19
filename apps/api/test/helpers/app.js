import { randomBytes } from 'node:crypto';
import express from 'express';
import { MemoryStore } from 'express-rate-limit';
import { applyCoreMiddleware, applyErrorHandling, createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/load-config.js';
import { createLogger } from '../../src/lib/logger/create-logger.js';
import { createLogCapture } from './log-capture.js';
import { createRecordingMailer } from './mail.js';

/** @typedef {import('../../src/config/load-config.js').AppConfig} AppConfig */

/**
 * Secrets de test, tirés au hasard à chaque exécution : aucun secret n'est écrit dans le dépôt,
 * et aucun test ne peut dépendre d'une valeur connue.
 */
export const TEST_SECRETS = Object.freeze({
  ACCESS_TOKEN_SECRET: randomBytes(32).toString('base64'),
  HASH_SECRET: randomBytes(32).toString('base64'),
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
});

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
    ...TEST_SECRETS,
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
 * qui réussissent, des stockages de rate limit en mémoire, et un mailer qui enregistre.
 *
 * @param {object} [options]
 * @param {AppConfig} [options.config]
 * @param {import('../../src/lib/health/readiness.js').ReadinessChecks} [options.readinessChecks]
 * @param {import('express-rate-limit').Store} [options.rateLimitStore]
 * @param {(name: string) => import('express-rate-limit').Store} [options.createRateLimitStore]
 * @param {ReturnType<typeof createRecordingMailer>} [options.mailer]
 * @param {{ now: () => Date }} [options.clock]
 * @param {import('../../src/lib/auth/password-hasher.js').PasswordHasher} [options.passwordHasher]
 */
export function buildTestApp({
  config = createTestConfig(),
  readinessChecks = { mongo: async () => {}, redis: async () => {} },
  rateLimitStore = new MemoryStore(),
  createRateLimitStore = () => new MemoryStore(),
  mailer = createRecordingMailer(),
  clock,
  passwordHasher,
} = {}) {
  const { logger, logs } = createTestLogger();
  const app = createApp({
    config,
    logger,
    readinessChecks,
    rateLimitStore,
    createRateLimitStore,
    mailer,
    ...(clock ? { clock } : {}),
    ...(passwordHasher ? { passwordHasher } : {}),
  });
  return { app, logger, logs, mailer };
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
