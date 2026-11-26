/** Opérations qui modifient ou suppriment des documents existants. */
const MUTATING_QUERY_OPERATIONS = Object.freeze(
  /** @type {const} */ ([
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndReplace',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'replaceOne',
  ]),
);

/** Levée par toute tentative de modifier ou supprimer un document d'une collection en ajout seul. */
export class AppendOnlyViolationError extends Error {
  /**
   * @param {string} model
   * @param {string} operation
   */
  constructor(model, operation) {
    super(`${model} is append-only: ${operation}() refused`);
    this.name = 'AppendOnlyViolationError';
  }
}

/**
 * Collection en ajout seul (journal d'audit) : un document s'insère, ne se modifie jamais et
 * ne se supprime jamais par l'application. Toute requête de modification ou de suppression,
 * toute opération de bulkWrite autre qu'une insertion, et tout `save()` d'un document déjà
 * enregistré lèvent AppendOnlyViolationError.
 *
 * @param {import('mongoose').Schema} schema
 */
export function appendOnly(schema) {
  for (const operation of MUTATING_QUERY_OPERATIONS) {
    schema.pre(
      operation,
      { document: false, query: true },
      /** @this {import('mongoose').Query<unknown, unknown>} */
      function refuseMutation() {
        throw new AppendOnlyViolationError(this.model.modelName, operation);
      },
    );
  }

  schema.pre(
    'bulkWrite',
    /**
     * @this {import('mongoose').Model<unknown>}
     * @param {ReadonlyArray<unknown>} operations
     */
    function refuseBulkMutation(operations) {
      const mutating = operations.find(
        (operation) =>
          typeof operation !== 'object' || operation === null || !('insertOne' in operation),
      );
      if (mutating !== undefined) {
        throw new AppendOnlyViolationError(this.modelName, 'bulkWrite');
      }
    },
  );

  schema.pre(
    'save',
    /** @this {import('mongoose').Document} */
    function refuseUpdate() {
      if (!this.isNew) {
        throw new AppendOnlyViolationError(
          /** @type {import('mongoose').Model<unknown>} */ (this.constructor).modelName,
          'save',
        );
      }
    },
  );
}
