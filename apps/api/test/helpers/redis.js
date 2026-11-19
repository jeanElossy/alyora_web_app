import { randomUUID } from 'node:crypto';
import { createLogger } from '../../src/lib/logger/create-logger.js';
import { closeRedis, connectRedis, createRedisClient } from '../../src/lib/redis/redis.js';
import { TEST_REDIS_URL_ENV } from '../setup/global-setup.js';

const silentLogger = createLogger({ level: 'silent', service: 'api-test' });

/**
 * URL du vrai Redis de test, démarré par le setup global de Vitest.
 *
 * @returns {string}
 */
export function testRedisUrl() {
  const url = process.env[TEST_REDIS_URL_ENV];
  if (!url) {
    throw new Error(`${TEST_REDIS_URL_ENV} is not set: the Vitest global setup did not run`);
  }
  return url;
}

/**
 * Ouvre un client ioredis vers le Redis de test, avec les options de production.
 *
 * @returns {Promise<import('ioredis').Redis>}
 */
export async function connectTestRedis() {
  const client = createRedisClient({ url: testRedisUrl(), logger: silentLogger });
  await connectRedis(client);
  return client;
}

/** @param {import('ioredis').Redis} client */
export async function closeTestRedis(client) {
  await closeRedis(client);
}

/**
 * Nom unique, utilisé comme préfixe de clés : les fichiers de test exécutés en parallèle
 * partagent le même Redis sans jamais voir les clés des autres.
 *
 * @param {string} label
 * @returns {string}
 */
export function uniqueRedisName(label) {
  return `test-${label}-${randomUUID()}`;
}
