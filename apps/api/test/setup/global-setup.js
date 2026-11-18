import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Version de MongoDB utilisée par les tests, alignée sur celle du cluster Atlas (8.0.37 au
 * 2026-11-18). La clé de cache CI du binaire téléchargé dépend de ce fichier.
 */
export const MONGODB_TEST_VERSION = '8.0.37';

/** Variable d'environnement par laquelle les fichiers de test reçoivent l'URI du replica set. */
export const TEST_MONGO_URI_ENV = 'ALYORA_TEST_MONGO_URI';

/**
 * Setup global de Vitest : un replica set à un seul nœud (transactions disponibles) pour toute
 * l'exécution. Chaque worker de test y utilise sa propre base (voir test/helpers/db.js).
 *
 * @returns {Promise<() => Promise<void>>} Fonction de nettoyage.
 */
export default async function setup() {
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: MONGODB_TEST_VERSION },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  // Défini avant le démarrage des workers, qui en héritent.
  process.env[TEST_MONGO_URI_ENV] = replSet.getUri();

  return async () => {
    await replSet.stop();
  };
}
