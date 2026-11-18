const MAX_CAUSE_DEPTH = 3;

/**
 * @typedef {object} SerializedError
 * @property {string} type
 * @property {string} message
 * @property {string} [stack]
 * @property {string | number} [code]
 * @property {SerializedError | unknown} [cause]
 */

/**
 * Sérialiseur des erreurs pour les logs. Garde le type, le message, la pile et le code,
 * récursivement pour `cause`. Toutes les autres propriétés sont ignorées volontairement : des
 * bibliothèques attachent des données de la requête à leurs erreurs (body-parser recopie par
 * exemple le corps brut dans `err.body`).
 *
 * @param {unknown} error
 * @returns {SerializedError | unknown}
 */
export function serializeError(error) {
  return serialize(error, 0);
}

/**
 * @param {unknown} error
 * @param {number} depth
 * @returns {SerializedError | unknown}
 */
function serialize(error, depth) {
  if (!(error instanceof Error)) {
    return error;
  }
  /** @type {SerializedError} */
  const serialized = { type: error.name, message: error.message, stack: error.stack };
  const code = /** @type {{ code?: unknown }} */ (error).code;
  if (typeof code === 'string' || typeof code === 'number') {
    serialized.code = code;
  }
  if (error.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    serialized.cause = serialize(error.cause, depth + 1);
  }
  return serialized;
}
