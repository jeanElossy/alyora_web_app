import mongoose from 'mongoose';

/**
 * Vrai si `value` désigne concrètement un ou plusieurs locataires : un ObjectId (ou sa forme
 * hexadécimale), `{ $eq: id }` ou `{ $in: [id, ...] }` non vide.
 *
 * Tout le reste est refusé, en particulier :
 * - `undefined` : Mongoose retire la clé avant d'envoyer la requête, qui ne filtre alors plus
 *   rien (`{ eventId: undefined }` lit toute la collection) ;
 * - `null`, `{ $exists: true }`, `{ $ne: id }`, `{ $nin: [...] }`, `{ $in: [] }` : des
 *   filtres qui ne désignent pas un locataire précis.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isConcreteTenantValue(value) {
  // Reconnaît l'ObjectId à son type BSON, pas par instanceof : une autre copie du paquet bson
  // (celle du driver, par exemple) donne des instances d'une autre classe.
  if (mongoose.isObjectIdOrHexString(value)) {
    return true;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const operators = Object.keys(value);
  if (operators.length !== 1) {
    return false;
  }
  const operand = /** @type {Record<string, unknown>} */ (value)[
    /** @type {string} */ (operators[0])
  ];
  switch (operators[0]) {
    case '$eq':
      return isConcreteTenantValue(operand);
    case '$in':
      return Array.isArray(operand) && operand.length > 0 && operand.every(isConcreteTenantValue);
    default:
      return false;
  }
}

/**
 * Vrai si le filtre restreint la requête à des locataires précis : l'une des clés de
 * cloisonnement au premier niveau, ou dans l'une des clauses d'un `$and` de premier niveau,
 * avec une valeur concrète. Une clé qui n'apparaît que dans un `$or` ne suffit pas : l'autre
 * branche lirait les autres locataires.
 *
 * @param {unknown} filter
 * @param {ReadonlyArray<string>} keys Clés de cloisonnement du modèle (eventId, organizationId).
 * @returns {boolean}
 */
export function hasTenantScope(filter, keys) {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
    return false;
  }
  const conditions = /** @type {Record<string, unknown>} */ (filter);
  if (
    keys.some((key) => Object.hasOwn(conditions, key) && isConcreteTenantValue(conditions[key]))
  ) {
    return true;
  }
  const clauses = conditions.$and;
  return Array.isArray(clauses) && clauses.some((clause) => hasTenantScope(clause, keys));
}

/**
 * Vrai si le pipeline commence par un `$match` cloisonné. Les étapes suivantes ne sont pas
 * analysées : un `$lookup` vers une autre collection cloisonnée doit filtrer lui-même sur le
 * locataire (vérifié en revue, voir l'ADR 0006).
 *
 * @param {ReadonlyArray<unknown>} pipeline
 * @param {ReadonlyArray<string>} keys
 * @returns {boolean}
 */
export function pipelineHasTenantScope(pipeline, keys) {
  const first = pipeline[0];
  return (
    typeof first === 'object' &&
    first !== null &&
    '$match' in first &&
    hasTenantScope(first.$match, keys)
  );
}

/** Opérations d'un bulkWrite qui portent un filtre. */
const FILTERED_BULK_OPERATIONS = /** @type {const} */ ([
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'replaceOne',
]);

/**
 * Nom de la première opération d'un bulkWrite dont le filtre n'est pas cloisonné, ou null si
 * toutes le sont. Une insertion n'a pas de filtre : son document porte la clé (champ requis).
 *
 * @param {ReadonlyArray<unknown>} operations
 * @param {ReadonlyArray<string>} keys
 * @returns {string | null}
 */
export function findUnscopedBulkOperation(operations, keys) {
  for (const operation of operations) {
    if (typeof operation !== 'object' || operation === null) {
      return 'unknown';
    }
    for (const name of FILTERED_BULK_OPERATIONS) {
      if (name in operation) {
        const spec = /** @type {Record<string, { filter?: unknown }>} */ (operation)[name];
        if (!hasTenantScope(spec?.filter, keys)) {
          return name;
        }
      }
    }
  }
  return null;
}
