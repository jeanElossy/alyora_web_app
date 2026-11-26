import { PERMISSIONS } from './catalog.js';
import { normalizePermissions } from './permission-set.js';

/** @typedef {import('./catalog.js').Permission} Permission */

/**
 * Les cinq rôles prédéfinis, immuables : chacun n'est qu'un ensemble de permissions, défini ici
 * et nulle part ailleurs. Ils ne sont pas stockés en base : un collaborateur porte la clé de
 * son rôle (`roleKey`), et ses permissions se déduisent de ce fichier.
 *
 * Toute décision qui dépend d'un rôle passe par les fonctions de ce fichier : comparer une clé
 * de rôle à une chaîne ailleurs dans le code est interdit (règle ESLint).
 */
export const ROLE_KEYS = Object.freeze(
  /** @type {const} */ (['owner', 'admin', 'editor', 'reader', 'checkin_agent']),
);

/** @typedef {(typeof ROLE_KEYS)[number]} RoleKey */

/**
 * Le propriétaire de l'événement : un seul par événement (index unique). Ce rôle ne s'accorde
 * jamais par une invitation ni par une modification, seulement par un transfert de propriété.
 *
 * @type {RoleKey}
 */
export const OWNER_ROLE_KEY = 'owner';

/** Rôle que reçoit l'ancien propriétaire après un transfert de propriété. @type {RoleKey} */
export const FORMER_OWNER_ROLE_KEY = 'admin';

/** Lecture seule des contenus, sans aucune donnée financière. @type {Permission[]} */
const READER = [
  'event:read',
  'guests:read',
  'seating:read',
  'program:read',
  'messages:read',
  'albums:read',
  'collaborators:read',
];

/**
 * Prépare le contenu, sans rien publier, notifier ni toucher à l'argent. Peut inviter, dans la
 * limite de ses propres permissions (règle d'escalade).
 *
 * @type {Permission[]}
 */
const EDITOR = [
  ...READER,
  'guests:write',
  'notes:read',
  'notes:write',
  'rsvp:manage',
  'seating:write',
  'program:write',
  'albums:manage',
  'collaborators:invite',
  'checkin:read',
];

/** Accueil le jour J : la liste d'accueil et le scan, rien d'autre. @type {Permission[]} */
const CHECKIN_AGENT = ['event:read', 'checkin:read', 'checkin:scan'];

/**
 * Permissions de chaque rôle prédéfini, figées. L'administrateur a tout sauf les reversements :
 * la destination de l'argent reste au propriétaire, et un administrateur ne peut donc ni
 * modifier ni révoquer le propriétaire (ses permissions ne contiennent pas celles de la cible).
 *
 * @type {Readonly<Record<RoleKey, ReadonlyArray<Permission>>>}
 */
export const ROLE_PERMISSIONS = Object.freeze({
  owner: normalizePermissions(PERMISSIONS),
  admin: normalizePermissions(PERMISSIONS.filter((permission) => permission !== 'payouts:manage')),
  editor: normalizePermissions(EDITOR),
  reader: normalizePermissions(READER),
  checkin_agent: normalizePermissions(CHECKIN_AGENT),
});

/**
 * @param {unknown} value
 * @returns {value is RoleKey}
 */
export function isRoleKey(value) {
  return typeof value === 'string' && ROLE_KEYS.some((key) => key === value);
}

/**
 * @param {RoleKey} roleKey
 * @returns {ReadonlyArray<Permission>}
 */
export function permissionsOfRole(roleKey) {
  return ROLE_PERMISSIONS[roleKey];
}

/**
 * @param {RoleKey | null | undefined} roleKey
 * @returns {boolean}
 */
export function isOwnerRole(roleKey) {
  return roleKey === OWNER_ROLE_KEY;
}
