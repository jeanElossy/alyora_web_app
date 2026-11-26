import {
  isOwnerRole,
  isRoleKey,
  normalizePermissions,
  permissionsOfRole,
  unknownPermissions,
} from '@alyora/shared';
import { AppError } from '../../../lib/errors/app-error.js';
import { CustomRole } from '../models/custom-role.model.js';

/** @typedef {import('@alyora/shared').Permission} Permission */
/** @typedef {import('@alyora/shared').EventRole} EventRole */
/** @typedef {import('@alyora/shared').RoleAssignment} RoleAssignment */

/**
 * Champs du rôle d'un document stocké (collaborateur ou invitation).
 *
 * @typedef {object} StoredAssignment
 * @property {unknown} [_id]
 * @property {unknown} [roleKey]
 * @property {unknown} [customRoleId]
 * @property {unknown[] | null} [permissions]
 */

/** @typedef {{ role: EventRole, permissions: ReadonlyArray<Permission> }} ResolvedRole */

/** @param {unknown} value */
const isSet = (value) => value !== null && value !== undefined;

const NO_PERMISSION = Object.freeze(/** @type {Permission[]} */ ([]));

/**
 * Les champs MongoDB d'un rôle demandé : exactement un des trois est renseigné.
 *
 * @param {RoleAssignment} role
 * @returns {{ roleKey: import('@alyora/shared').RoleKey | null, customRoleId: string | null, permissions?: Permission[] }}
 */
export function assignmentFields(role) {
  switch (role.type) {
    case 'predefined':
      return { roleKey: role.key, customRoleId: null };
    case 'custom':
      return { roleKey: null, customRoleId: role.customRoleId };
    default:
      return {
        roleKey: null,
        customRoleId: null,
        permissions: [...normalizePermissions(role.permissions)],
      };
  }
}

/**
 * Mise à jour MongoDB qui remplace le rôle d'un collaborateur, en effaçant les autres formes.
 *
 * @param {RoleAssignment} role
 */
export function assignmentUpdate(role) {
  const fields = assignmentFields(role);
  return fields.permissions ? { $set: fields } : { $set: fields, $unset: { permissions: 1 } };
}

/**
 * Le rôle d'un document stocké, tel que l'API le décrit.
 *
 * @param {StoredAssignment} record
 * @returns {EventRole}
 */
export function describeRole(record) {
  if (isSet(record.roleKey)) {
    return isRoleKey(record.roleKey)
      ? { type: 'predefined', key: record.roleKey }
      : { type: 'explicit' };
  }
  if (isSet(record.customRoleId)) {
    return { type: 'custom', customRoleId: String(record.customRoleId) };
  }
  return { type: 'explicit' };
}

/**
 * Vrai pour le rôle de propriétaire, qu'il soit demandé ou stocké.
 *
 * @param {{ type: string, key?: unknown }} role
 * @returns {boolean}
 */
export function isOwnerAssignment(role) {
  return role.type === 'predefined' && isRoleKey(role.key) && isOwnerRole(role.key);
}

/**
 * Permissions effectives de rôles stockés, tous de la même organisation, avec une seule
 * requête pour leurs rôles personnalisés. Un rôle personnalisé est cherché dans cette
 * organisation seulement : celui d'une autre organisation, ou supprimé, ne donne rien. Une
 * clé de rôle inconnue ou une permission hors catalogue est écartée et signalée.
 *
 * @param {ReadonlyArray<StoredAssignment>} records
 * @param {object} options
 * @param {string} options.organizationId
 * @param {import('pino').Logger} options.logger
 * @param {import('mongoose').ClientSession | null} [options.session]
 * @returns {Promise<ResolvedRole[]>}
 */
export async function resolveAssignments(records, { organizationId, logger, session = null }) {
  const customRoleIds = [
    ...new Set(
      records
        .filter((record) => !isSet(record.roleKey) && isSet(record.customRoleId))
        .map((record) => String(record.customRoleId)),
    ),
  ];
  const customRoles =
    customRoleIds.length === 0
      ? []
      : await CustomRole.find(
          { organizationId, _id: { $in: customRoleIds }, deletedAt: null },
          { permissions: 1 },
        )
          .session(session)
          .lean();
  const permissionsByRole = new Map(
    customRoles.map((role) => [String(role._id), role.permissions]),
  );

  /**
   * @param {unknown[]} values
   * @param {Record<string, unknown>} where
   */
  const known = (values, where) => {
    const unknown = unknownPermissions(values);
    if (unknown.length > 0) {
      logger.warn(
        { event: 'access.unknown_permissions', count: unknown.length, ...where },
        'Permissions missing from the catalog were ignored',
      );
    }
    return normalizePermissions(values);
  };

  return records.map((record) => {
    const recordId = String(record._id);
    const role = describeRole(record);
    if (role.type === 'predefined') {
      return { role, permissions: permissionsOfRole(role.key) };
    }
    if (role.type === 'custom') {
      const permissions = permissionsByRole.get(role.customRoleId);
      if (!permissions) {
        logger.warn(
          { event: 'access.custom_role_missing', recordId, customRoleId: role.customRoleId },
          'Custom role not found in the organization: no permission granted',
        );
        return { role, permissions: NO_PERMISSION };
      }
      return { role, permissions: known(permissions, { customRoleId: role.customRoleId }) };
    }
    if (isSet(record.roleKey)) {
      logger.warn({ event: 'access.unknown_role', recordId }, 'Unknown role key ignored');
      return { role, permissions: NO_PERMISSION };
    }
    return { role, permissions: known(record.permissions ?? [], { recordId }) };
  });
}

/**
 * Permissions qu'accorderait un rôle demandé, dans l'organisation de l'événement. Un rôle
 * personnalisé inconnu de cette organisation : NOT_FOUND.
 *
 * @param {RoleAssignment} role
 * @param {{ organizationId: string, session: import('mongoose').ClientSession | null }} options
 * @returns {Promise<ReadonlyArray<Permission>>}
 */
export async function grantedPermissions(role, { organizationId, session }) {
  switch (role.type) {
    case 'predefined':
      return permissionsOfRole(role.key);
    case 'custom': {
      const customRole = await CustomRole.findOne(
        { _id: role.customRoleId, organizationId, deletedAt: null },
        { permissions: 1 },
      )
        .session(session)
        .lean();
      if (!customRole) {
        throw new AppError('NOT_FOUND', { message: 'Custom role not found' });
      }
      return normalizePermissions(customRole.permissions);
    }
    default:
      return normalizePermissions(role.permissions);
  }
}

/**
 * Instantané d'un rôle pour le journal d'audit : la forme du rôle et les permissions qu'il
 * donnait, rien d'autre.
 *
 * @param {EventRole} role
 * @param {ReadonlyArray<Permission>} permissions
 */
export function roleSnapshot(role, permissions) {
  return { role: { ...role }, permissions: [...permissions] };
}
