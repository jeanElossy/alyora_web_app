import { AsyncLocalStorage } from 'node:async_hooks';
import { SENSITIVE_KEY_PATTERN } from './redact.js';

/**
 * Les valeurs plus courtes ne sont pas effacées par valeur (elles effaceraient du texte sans
 * rapport) ; elles restent masquées par nom de champ.
 */
export const MIN_SECRET_LENGTH = 6;

const MAX_SECRETS = 50;
const MAX_DEPTH = 10;

/**
 * Valeurs sensibles envoyées par le client de la requête en cours. Gardées dans un stockage
 * privé, distinct du contexte de requête public, pour qu'aucun code ne puisse les y relire.
 *
 * @type {AsyncLocalStorage<ReadonlyArray<string>>}
 */
const storage = new AsyncLocalStorage();

/**
 * @template T
 * @param {ReadonlyArray<string>} secrets
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithRequestSecrets(secrets, fn) {
  return storage.run(secrets, fn);
}

/** @returns {ReadonlyArray<string>} */
export function getRequestSecrets() {
  return storage.getStore() ?? [];
}

/**
 * Collecte les valeurs que le client a envoyées sous un nom sensible (password, token, email,
 * phone...), dans le corps et la query string, ainsi que les en-têtes d'identification. Le
 * logger les efface ensuite de chaque ligne écrite pendant la requête, même d'un texte libre
 * comme un message d'erreur construit à partir de l'entrée.
 *
 * @param {{ body?: unknown, query?: unknown, headers: import('node:http').IncomingHttpHeaders }} req
 * @returns {ReadonlyArray<string>} Les plus longues d'abord, pour qu'une valeur qui en
 *   contient une autre soit effacée en entier.
 */
export function collectRequestSecrets({ body, query, headers }) {
  /** @type {Set<string>} */
  const found = new Set();
  collect(body, false, found, 0);
  collect(query, false, found, 0);
  collectHeaders(headers, found);
  return Object.freeze(
    [...found]
      .filter((value) => value.length >= MIN_SECRET_LENGTH)
      .sort((a, b) => b.length - a.length)
      .slice(0, MAX_SECRETS),
  );
}

/**
 * @param {unknown} value
 * @param {boolean} sensitive Vrai si le nom d'un champ englobant est sensible.
 * @param {Set<string>} found
 * @param {number} depth
 */
function collect(value, sensitive, found, depth) {
  if (depth > MAX_DEPTH || value === null || value === undefined) {
    return;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    if (sensitive) {
      found.add(String(value));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collect(item, sensitive, found, depth + 1);
    }
    return;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      collect(item, sensitive || SENSITIVE_KEY_PATTERN.test(key), found, depth + 1);
    }
  }
}

/**
 * @param {import('node:http').IncomingHttpHeaders} headers
 * @param {Set<string>} found
 */
function collectHeaders(headers, found) {
  const { authorization, cookie } = headers;
  if (authorization) {
    found.add(authorization);
    // "Bearer <jeton>" : le jeton seul aussi.
    const credential = authorization.split(' ').slice(1).join(' ');
    if (credential) {
      found.add(credential);
    }
  }
  for (const pair of (cookie ?? '').split(';')) {
    const value = pair.slice(pair.indexOf('=') + 1).trim();
    if (pair.includes('=') && value) {
      found.add(value);
    }
  }
}
