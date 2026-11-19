// Collections et index de l'authentification (M0.4). Seule source des index de ces
// collections : les modèles Mongoose n'en créent aucun (autoIndex: false), et les tests
// appliquent cette migration.
//
// Le retour arrière supprime les index, jamais les collections ni leurs données (les
// suppressions importantes sont logiques).

/** @type {ReadonlyArray<[string, import('mongodb').IndexDescription[]]>} */
const COLLECTIONS = [
  [
    'users',
    [
      {
        // Une adresse ne désigne qu'un compte vivant ; après une suppression logique, elle peut
        // servir à un nouveau compte. deletedAt vaut toujours null explicitement (défaut du
        // modèle) : $type 'null' ne retient que ces documents.
        name: 'email_unique_live',
        key: { email: 1 },
        unique: true,
        partialFilterExpression: { deletedAt: { $type: 'null' } },
      },
    ],
  ],
  [
    'sessions',
    [{ name: 'user_active_sessions', key: { userId: 1, revokedAt: 1, lastSeenAt: -1 } }],
  ],
  [
    'refresh_tokens',
    [
      { name: 'token_hash_unique', key: { tokenHash: 1 }, unique: true },
      { name: 'family', key: { familyId: 1 } },
      { name: 'session', key: { sessionId: 1 } },
      // Un jeton expiré n'a plus d'usage : MongoDB l'efface (un rejeu est alors un jeton inconnu).
      { name: 'expires_ttl', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
  ],
  [
    'verification_tokens',
    [
      { name: 'token_hash_unique', key: { tokenHash: 1 }, unique: true },
      { name: 'user_purpose', key: { userId: 1, purpose: 1, consumedAt: 1 } },
      { name: 'expires_ttl', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
  ],
  [
    'idempotency_keys',
    [
      { name: 'scope_key_unique', key: { scope: 1, key: 1 }, unique: true },
      { name: 'expires_ttl', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
  ],
];

/**
 * @param {import('mongodb').Db} db
 * @returns {Promise<void>}
 */
export const up = async (db) => {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
  );
  for (const [name, indexes] of COLLECTIONS) {
    // Créées explicitement : une transaction ne doit jamais avoir à créer une collection.
    if (!existing.has(name)) {
      await db.createCollection(name);
    }
    await db.collection(name).createIndexes(indexes);
  }
};

/**
 * @param {import('mongodb').Db} db
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  for (const [name, indexes] of COLLECTIONS) {
    for (const index of indexes) {
      if (index.name && (await db.collection(name).indexExists(index.name))) {
        await db.collection(name).dropIndex(index.name);
      }
    }
  }
};
