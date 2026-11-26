// Collections et index des autorisations (M0.5). Seule source des index de ces collections :
// les modèles Mongoose n'en créent aucun (autoIndex: false), et les tests appliquent cette
// migration.
//
// Les valeurs sont écrites en clair (« owner », « active ») plutôt qu'importées : une
// migration décrit l'état de la base à sa date et ne doit pas changer avec le code.
//
// Le retour arrière supprime les index, jamais les collections ni leurs données (les
// suppressions importantes sont logiques).

/** @type {ReadonlyArray<[string, import('mongodb').IndexDescription[]]>} */
const COLLECTIONS = [
  // Racine du cloisonnement, filtrée par _id : aucun index de plus.
  ['organizations', []],
  [
    'organization_members',
    [
      {
        name: 'organization_user_active_unique',
        key: { organizationId: 1, userId: 1 },
        unique: true,
        partialFilterExpression: { status: 'active' },
      },
    ],
  ],
  [
    'collaborators',
    [
      {
        // Un compte n'a qu'un accès actif à un événement ; après une révocation, il peut être
        // invité de nouveau.
        name: 'event_user_active_unique',
        key: { eventId: 1, userId: 1 },
        unique: true,
        partialFilterExpression: { status: 'active' },
      },
      {
        // Un seul propriétaire actif par événement : dernier rempart du transfert de propriété.
        name: 'event_owner_unique',
        key: { eventId: 1 },
        unique: true,
        partialFilterExpression: { roleKey: 'owner', status: 'active' },
      },
      { name: 'event_status', key: { eventId: 1, status: 1, _id: 1 } },
      { name: 'organization_custom_role', key: { organizationId: 1, customRoleId: 1 } },
    ],
  ],
  [
    'collaboration_invitations',
    [
      { name: 'event_token_unique', key: { eventId: 1, tokenHash: 1 }, unique: true },
      {
        name: 'event_email_pending_unique',
        key: { eventId: 1, email: 1 },
        unique: true,
        partialFilterExpression: { status: 'pending' },
      },
      { name: 'event_status', key: { eventId: 1, status: 1, _id: 1 } },
    ],
  ],
  [
    'custom_roles',
    [
      {
        // deletedAt vaut toujours null explicitement (défaut du modèle) : $type 'null' ne
        // retient que les rôles non supprimés.
        name: 'organization_name_live_unique',
        key: { organizationId: 1, name: 1 },
        unique: true,
        partialFilterExpression: { deletedAt: { $type: 'null' } },
      },
    ],
  ],
  [
    'audit_logs',
    [
      { name: 'organization_created', key: { organizationId: 1, createdAt: -1 } },
      {
        name: 'event_created',
        key: { eventId: 1, createdAt: -1 },
        partialFilterExpression: { eventId: { $type: 'objectId' } },
      },
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
    if (indexes.length > 0) {
      await db.collection(name).createIndexes(indexes);
    }
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
