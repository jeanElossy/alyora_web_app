import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { Redis } from 'ioredis';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Version de MongoDB utilisée par les tests, alignée sur celle du cluster Atlas (8.0.37 au
 * 2026-11-18). La clé de cache CI du binaire téléchargé dépend de ce fichier.
 */
export const MONGODB_TEST_VERSION = '8.0.37';

/** Image Docker du Redis de test, la même que celle du README pour le développement local. */
export const REDIS_TEST_IMAGE = 'redis:8';

/** Variable d'environnement par laquelle les fichiers de test reçoivent l'URI du replica set. */
export const TEST_MONGO_URI_ENV = 'ALYORA_TEST_MONGO_URI';

/** Variable d'environnement par laquelle les fichiers de test reçoivent l'URL de Redis. */
export const TEST_REDIS_URL_ENV = 'ALYORA_TEST_REDIS_URL';

/** Si elle est définie, les tests utilisent ce Redis au lieu d'en démarrer un dans Docker. */
export const REDIS_TEST_URL_OVERRIDE_ENV = 'REDIS_TEST_URL';

/** Étiquette des conteneurs de test, pour retrouver ceux qu'un arrêt brutal aurait laissés. */
const CONTAINER_LABEL = 'alyora-test=redis';
const REDIS_READY_TIMEOUT_MS = 15_000;

const run = promisify(execFile);

/**
 * Setup global de Vitest, pour toute l'exécution :
 * - un replica set MongoDB à un seul nœud (transactions disponibles). Chaque worker de test y
 *   utilise sa propre base (voir test/helpers/db.js) ;
 * - un vrai Redis. Les tests y isolent leurs clés par un préfixe unique (voir
 *   test/helpers/redis.js).
 *
 * @returns {Promise<() => Promise<void>>} Fonction de nettoyage.
 */
export default async function setup() {
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: MONGODB_TEST_VERSION },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  /** @type {{ url: string, stop: () => Promise<void> }} */
  let redis;
  try {
    redis = await startRedis();
  } catch (error) {
    await replSet.stop();
    throw error;
  }

  // Définies avant le démarrage des workers, qui en héritent.
  process.env[TEST_MONGO_URI_ENV] = replSet.getUri();
  process.env[TEST_REDIS_URL_ENV] = redis.url;

  return async () => {
    await Promise.all([replSet.stop(), redis.stop()]);
  };
}

/**
 * Utilise le Redis désigné par REDIS_TEST_URL, ou démarre un conteneur Docker jetable, sur
 * un port aléatoire de 127.0.0.1, sans persistance. Comme pour MongoDB, `pnpm test` ne
 * demande donc aucun Redis installé, seulement Docker.
 *
 * @returns {Promise<{ url: string, stop: () => Promise<void> }>}
 */
async function startRedis() {
  const override = process.env[REDIS_TEST_URL_OVERRIDE_ENV]?.trim();
  if (override) {
    await waitForRedis(override);
    return { url: override, stop: async () => {} };
  }

  const name = `alyora-test-redis-${randomUUID().slice(0, 8)}`;
  try {
    await run('docker', [
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '--label',
      CONTAINER_LABEL,
      '--publish',
      '127.0.0.1::6379',
      REDIS_TEST_IMAGE,
      'redis-server',
      '--save',
      '',
      '--appendonly',
      'no',
    ]);
  } catch (error) {
    throw new Error(
      `Cannot start the test Redis container (${REDIS_TEST_IMAGE}). The API tests need Docker, ` +
        `or ${REDIS_TEST_URL_OVERRIDE_ENV} pointing to a Redis that may be flushed.`,
      { cause: error },
    );
  }

  const stop = async () => {
    await run('docker', ['rm', '--force', name]).catch(() => {});
  };
  try {
    const { stdout } = await run('docker', ['port', name, '6379/tcp']);
    const address = stdout.trim().split('\n')[0];
    const url = `redis://${address}`;
    await waitForRedis(url);
    return { url, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

/**
 * Attend que Redis réponde à PING : le conteneur accepte les connexions un peu après son
 * démarrage.
 *
 * @param {string} url
 * @returns {Promise<void>}
 */
async function waitForRedis(url) {
  const deadline = Date.now() + REDIS_READY_TIMEOUT_MS;
  for (;;) {
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    // Les échecs de connexion sont attendus pendant l'attente : ils sont rejetés par connect().
    client.on('error', () => {});
    try {
      await client.connect();
      await client.ping();
      await client.quit();
      return;
    } catch (error) {
      client.disconnect();
      if (Date.now() > deadline) {
        throw new Error(`Test Redis did not answer within ${REDIS_READY_TIMEOUT_MS} ms`, {
          cause: error,
        });
      }
      await delay(100);
    }
  }
}
