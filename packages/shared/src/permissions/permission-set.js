import { isPermission, permissionRank } from './catalog.js';

/** @typedef {import('./catalog.js').Permission} Permission */

/**
 * Liste de permissions sans doublon, triée dans l'ordre du catalogue, figée. Les valeurs
 * inconnues du catalogue sont écartées : une permission retirée du catalogue disparaît des
 * rôles personnalisés et des listes explicites qui la contenaient encore.
 *
 * @param {Iterable<unknown>} values
 * @returns {ReadonlyArray<Permission>}
 */
export function normalizePermissions(values) {
  const known = new Set();
  for (const value of values) {
    if (isPermission(value)) {
      known.add(value);
    }
  }
  return Object.freeze(
    /** @type {Permission[]} */ ([...known]).sort((a, b) => permissionRank(a) - permissionRank(b)),
  );
}

/**
 * Valeurs absentes du catalogue (fautes de frappe, permissions retirées).
 *
 * @param {Iterable<unknown>} values
 * @returns {unknown[]}
 */
export function unknownPermissions(values) {
  return [...values].filter((value) => !isPermission(value));
}

/**
 * @param {Iterable<Permission>} permissions
 * @param {Permission} permission
 * @returns {boolean}
 */
export function hasPermission(permissions, permission) {
  for (const held of permissions) {
    if (held === permission) {
      return true;
    }
  }
  return false;
}

/**
 * Permissions de `granted` que `held` ne contient pas, dans l'ordre du catalogue.
 *
 * @param {Iterable<Permission>} granted
 * @param {Iterable<Permission>} held
 * @returns {ReadonlyArray<Permission>}
 */
export function missingPermissions(granted, held) {
  const heldSet = new Set(held);
  return normalizePermissions([...granted].filter((permission) => !heldSet.has(permission)));
}

/**
 * Vrai si chaque permission de `granted` figure dans `held` (sous-ensemble strict ou égal).
 * C'est la règle d'escalade : un collaborateur n'accorde jamais une permission qu'il ne
 * détient pas.
 *
 * @param {Iterable<Permission>} granted
 * @param {Iterable<Permission>} held
 * @returns {boolean}
 */
export function isSubsetOf(granted, held) {
  return missingPermissions(granted, held).length === 0;
}
