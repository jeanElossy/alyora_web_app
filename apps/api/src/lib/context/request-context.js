import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexte de l'unité de travail en cours : une requête HTTP dans l'API, un job dans le
 * worker. Il suit chaque continuation asynchrone, si bien que les services et les logs le
 * lisent sans le recevoir en argument.
 *
 * @typedef {object} RequestContext
 * @property {string} correlationId
 */

/** @type {AsyncLocalStorage<RequestContext>} */
const storage = new AsyncLocalStorage();

/**
 * Exécute `fn` dans `context`. Tout ce que `fn` déclenche, de façon synchrone ou non, le voit.
 * Le worker s'en sert pour donner à chaque job l'identifiant de corrélation de la requête
 * qui l'a créé.
 *
 * @template T
 * @param {RequestContext} context
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithContext(context, fn) {
  return storage.run(Object.freeze({ ...context }), fn);
}

/** @returns {RequestContext | undefined} */
export function getRequestContext() {
  return storage.getStore();
}

/** @returns {string | undefined} */
export function getCorrelationId() {
  return storage.getStore()?.correlationId;
}
