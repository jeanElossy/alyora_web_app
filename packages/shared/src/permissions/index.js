// Permissions partagées par l'API (qui les applique) et le client web (affichage seulement).
// Le serveur reste la seule autorité : le client ne décide jamais d'un accès.
export { FINANCIAL_PERMISSIONS, PERMISSIONS, isPermission, permissionRank } from './catalog.js';
export {
  hasPermission,
  isSubsetOf,
  missingPermissions,
  normalizePermissions,
  unknownPermissions,
} from './permission-set.js';
export {
  FORMER_OWNER_ROLE_KEY,
  OWNER_ROLE_KEY,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
  isOwnerRole,
  isRoleKey,
  permissionsOfRole,
} from './roles.js';

// Types réexportés (un typedef JSDoc n'est pas transmis par `export ... from`).
/** @typedef {import('./catalog.js').Permission} Permission */
/** @typedef {import('./roles.js').RoleKey} RoleKey */
