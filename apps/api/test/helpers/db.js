import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { connectMongo, disconnectMongo } from '../../src/lib/db/mongo.js';
import { createLogger } from '../../src/lib/logger/create-logger.js';
import { TEST_MONGO_URI_ENV } from '../setup/global-setup.js';

const silentLogger = createLogger({ level: 'silent', service: 'api-test' });

/**
 * URI du replica set de test partagé, pointant vers une base propre à ce worker de test, pour
 * que des fichiers de test exécutés en parallèle ne voient jamais les données des autres.
 *
 * @param {string} [suffix] Suffixe ajouté au nom de la base, pour une seconde base isolée.
 * @returns {string}
 */
export function testMongoUri(suffix = '') {
  const base = process.env[TEST_MONGO_URI_ENV];
  if (!base) {
    throw new Error(`${TEST_MONGO_URI_ENV} is not set: the Vitest global setup did not run`);
  }
  const workerId = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? '0';
  const url = new URL(base);
  url.pathname = `/alyora_test_${workerId}${suffix}`;
  return url.toString();
}

/**
 * Connecte la connexion Mongoose par défaut à la base du worker pour le fichier de test en
 * cours, et vide toutes les collections avant chaque test.
 */
export function useTestDatabase() {
  beforeAll(async () => {
    await connectMongo({ uri: testMongoUri(), maxPoolSize: 5, logger: silentLogger });
  });
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
  });
}

/**
 * Vide toutes les collections de la base de test connectée. Nettoyage technique d'une base de
 * test seulement : la règle du filtre par locataire (eventId / organizationId) ne s'applique pas.
 *
 * @returns {Promise<void>}
 */
export async function resetDatabase() {
  const { db } = mongoose.connection;
  if (!db) {
    throw new Error('resetDatabase(): no open MongoDB connection');
  }
  for (const collection of await db.collections()) {
    await collection.deleteMany({});
  }
}
