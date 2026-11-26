/**
 * Levée par une requête MongoDB sans filtre de cloisonnement (eventId ou organizationId) sur
 * une collection cloisonnée. C'est une erreur de programmation : la requête n'est jamais
 * exécutée, dans aucun environnement, et le client reçoit une INTERNAL_ERROR générique.
 */
export class UnscopedQueryError extends Error {
  /**
   * @param {object} details
   * @param {string} details.model
   * @param {string} details.operation
   */
  constructor({ model, operation }) {
    super(`Query without tenant filter refused: ${model}.${operation}()`);
    this.name = 'UnscopedQueryError';
    /** @readonly */
    this.model = model;
    /** @readonly */
    this.operation = operation;
  }
}

/** @type {import('pino').Logger | null} */
let alertLogger = null;

/**
 * Désigne le logger des alertes du cloisonnement. Appelé au démarrage de l'API : le plugin
 * s'installe à la définition des modèles, avant que le logger existe.
 *
 * @param {{ logger: import('pino').Logger | null }} options
 * @returns {() => void} Rétablit le logger précédent (tests).
 */
export function configureTenancyGuard({ logger }) {
  const previous = alertLogger;
  alertLogger = logger;
  return () => {
    alertLogger = previous;
  };
}

/**
 * Refuse une requête non cloisonnée : alerte critique dans les logs, puis UnscopedQueryError.
 * Décision de l'ADR 0006 : refuser aussi en production, car une requête qui s'exécuterait
 * pourrait lire les données d'un autre locataire. Le log ne contient que les noms des clés du
 * filtre, jamais ses valeurs (une adresse e-mail, par exemple).
 *
 * @param {object} details
 * @param {string} details.model
 * @param {string} details.operation
 * @param {string[]} [details.filterKeys]
 * @returns {never}
 */
export function refuseUnscopedQuery({ model, operation, filterKeys = [] }) {
  alertLogger?.error(
    { event: 'tenancy.unscoped_query', severity: 'critical', model, operation, filterKeys },
    'Query without tenant filter refused',
  );
  throw new UnscopedQueryError({ model, operation });
}
