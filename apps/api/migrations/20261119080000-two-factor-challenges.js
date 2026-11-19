// Étapes 2FA des connexions (M0.4b). Seule source des index de cette collection (le modèle
// Mongoose n'en crée aucun). Le retour arrière supprime les index, jamais la collection.

/** @type {import('mongodb').IndexDescription[]} */
const INDEXES = [
  { name: 'token_hash_unique', key: { tokenHash: 1 }, unique: true },
  // Une étape expirée n'a plus d'usage : MongoDB l'efface.
  { name: 'expires_ttl', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
];

const COLLECTION = 'two_factor_challenges';

/**
 * @param {import('mongodb').Db} db
 * @returns {Promise<void>}
 */
export const up = async (db) => {
  const existing = await db.listCollections({ name: COLLECTION }, { nameOnly: true }).toArray();
  if (existing.length === 0) {
    await db.createCollection(COLLECTION);
  }
  await db.collection(COLLECTION).createIndexes(INDEXES);
};

/**
 * @param {import('mongodb').Db} db
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  for (const index of INDEXES) {
    if (index.name && (await db.collection(COLLECTION).indexExists(index.name))) {
      await db.collection(COLLECTION).dropIndex(index.name);
    }
  }
};
