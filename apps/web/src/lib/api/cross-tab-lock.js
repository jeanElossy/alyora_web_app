/**
 * Ce dont le verrou a besoin de navigator.locks.
 *
 * @typedef {{ request: (name: string, callback: () => Promise<unknown>) => Promise<unknown> }} LockManagerLike
 */

/**
 * Exécute `task` sous un verrou partagé par tous les onglets de l'application (Web Locks API) :
 * deux onglets ne l'exécutent jamais en même temps. Sert au refresh de session : l'API tourne
 * le refresh token à chaque usage, et traite un second usage du même jeton comme un vol (toute
 * la session serait révoquée). Deux onglets rouverts ensemble rafraîchissent donc l'un après
 * l'autre, le second avec le cookie déjà renouvelé par le premier.
 *
 * Sans Web Locks (navigateur ancien), la tâche s'exécute sans verrou.
 *
 * @template T
 * @param {string} name
 * @param {() => Promise<T>} task
 * @param {LockManagerLike | undefined} [locks]
 * @returns {Promise<T>}
 */
export function withCrossTabLock(name, task, locks = globalThis.navigator?.locks) {
  if (!locks?.request) {
    return task();
  }
  return /** @type {Promise<T>} */ (locks.request(name, task));
}
