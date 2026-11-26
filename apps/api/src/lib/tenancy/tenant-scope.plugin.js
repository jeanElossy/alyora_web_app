import { refuseUnscopedQuery } from './tenancy-guard.js';
import {
  findUnscopedBulkOperation,
  hasTenantScope,
  pipelineHasTenantScope,
} from './tenant-filter.js';

/**
 * Opérations de requête vérifiées. Les insertions n'ont pas de filtre : la clé de
 * cloisonnement est un champ requis du document. `save()` sur un document existant ne passe
 * pas par ces hooks, mais ce document a été lu par une requête cloisonnée, ou créé avec sa clé.
 */
export const SCOPED_QUERY_OPERATIONS = Object.freeze(
  /** @type {const} */ ([
    'find',
    'findOne',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndReplace',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'replaceOne',
    'countDocuments',
    'distinct',
  ]),
);

/**
 * Clés de cloisonnement de chaque schéma cloisonné : le test de classement des modèles s'en
 * sert pour vérifier que chaque collection est soit cloisonnée, soit déclarée « plateforme ».
 *
 * @type {WeakMap<import('mongoose').Schema, ReadonlyArray<string>>}
 */
const tenantKeysBySchema = new WeakMap();

/**
 * Plugin de cloisonnement : refuse toute requête find, update, delete, count, distinct,
 * aggregate ou bulkWrite qui ne filtre pas sur l'une des clés du modèle. C'est un filet de
 * sécurité, pas une dispense : chaque service passe lui-même le filtre.
 *
 * Conséquences voulues : `findById`, `doc.updateOne()` et `doc.deleteOne()` filtrent sur `_id`
 * seul et sont refusés ; on écrit `findOne({ _id, eventId })`. `populate` vers un modèle
 * cloisonné est refusé de même. Le driver brut (`Model.collection`) contourne le plugin : il
 * est réservé aux migrations.
 *
 * @param {import('mongoose').Schema} schema
 * @param {{ keys: ReadonlyArray<string> }} options Clés acceptées, une seule suffit :
 *   `['eventId']`, `['organizationId']`, `['eventId', 'organizationId']`, ou `['_id']` pour la
 *   racine d'un locataire (une organisation).
 */
export function tenantScoped(schema, { keys }) {
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new TypeError('tenantScoped(): at least one tenant key is required');
  }
  const tenantKeys = Object.freeze([...keys]);
  tenantKeysBySchema.set(schema, tenantKeys);

  // Un hook par opération : il connaît son nom (Query.op n'est pas typé par Mongoose).
  for (const operation of SCOPED_QUERY_OPERATIONS) {
    schema.pre(
      operation,
      { document: false, query: true },
      /** @this {import('mongoose').Query<unknown, unknown>} */
      function checkQueryScope() {
        const filter = this.getFilter();
        if (!hasTenantScope(filter, tenantKeys)) {
          refuseUnscopedQuery({
            model: this.model.modelName,
            operation,
            filterKeys: Object.keys(filter),
          });
        }
      },
    );
  }

  // Compter toute la collection n'a jamais de sens pour un locataire.
  schema.pre(
    'estimatedDocumentCount',
    /** @this {import('mongoose').Query<unknown, unknown>} */
    function refuseEstimatedCount() {
      refuseUnscopedQuery({ model: this.model.modelName, operation: 'estimatedDocumentCount' });
    },
  );

  schema.pre(
    'aggregate',
    /** @this {import('mongoose').Aggregate<unknown>} */
    function checkPipelineScope() {
      if (!pipelineHasTenantScope(this.pipeline(), tenantKeys)) {
        refuseUnscopedQuery({ model: this.model().modelName, operation: 'aggregate' });
      }
    },
  );

  schema.pre(
    'bulkWrite',
    /**
     * @this {import('mongoose').Model<unknown>}
     * @param {ReadonlyArray<unknown>} operations
     */
    function checkBulkScope(operations) {
      const unscoped = findUnscopedBulkOperation(operations, tenantKeys);
      if (unscoped) {
        refuseUnscopedQuery({ model: this.modelName, operation: `bulkWrite.${unscoped}` });
      }
    },
  );
}

/**
 * Clés de cloisonnement d'un schéma, ou undefined s'il n'est pas cloisonné.
 *
 * @param {import('mongoose').Schema} schema
 * @returns {ReadonlyArray<string> | undefined}
 */
export function tenantKeysOf(schema) {
  return tenantKeysBySchema.get(schema);
}
