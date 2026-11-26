import {
  isRoleKey,
  normalizePermissions,
  permissionsOfRole,
  unknownPermissions,
} from '@alyora/shared';
import { Collaborator } from '../models/collaborator.model.js';
import { CustomRole } from '../models/custom-role.model.js';

/** @typedef {import('../../../lib/auth/require-permission.js').EventAccess} EventAccess */
/** @typedef {{ eventId: string, userId: string }} AccessKey */

/** @param {unknown} value */
const isSet = (value) => value !== null && value !== undefined;

/**
 * Résolution des permissions effectives d'un compte sur un événement, derrière le cache :
 * 1. le collaborateur actif (eventId, userId) ; aucun : null, soit un 404 ;
 * 2. son rôle prédéfini, son rôle personnalisé (cherché dans l'organisation du collaborateur
 *    seulement : un rôle d'une autre organisation ne donne rien) ou sa liste explicite ;
 * 3. croisé avec le catalogue : une permission inconnue est écartée et signalée.
 *
 * Un rôle personnalisé supprimé, ou une clé de rôle inconnue, laisse le collaborateur sans
 * aucune permission (403 sur tout, sauf les routes ouvertes à tout collaborateur).
 *
 * @param {object} deps
 * @param {import('./permission-cache.js').PermissionCache} deps.cache
 * @param {import('pino').Logger} deps.logger
 */
export function createPermissionResolver({ cache, logger }) {
  /**
   * @param {unknown[]} values
   * @param {Record<string, unknown>} where
   */
  function knownPermissions(values, where) {
    const unknown = unknownPermissions(values);
    if (unknown.length > 0) {
      logger.warn(
        { event: 'access.unknown_permissions', count: unknown.length, ...where },
        'Permissions missing from the catalog were ignored',
      );
    }
    return normalizePermissions(values);
  }

  /**
   * @param {{ _id: unknown, organizationId: unknown, roleKey?: unknown, customRoleId?: unknown, permissions?: unknown[] | null }} collaborator
   * @returns {Promise<Pick<EventAccess, 'role' | 'permissions'>>}
   */
  async function resolveRole(collaborator) {
    const collaboratorId = String(collaborator._id);
    if (isSet(collaborator.roleKey)) {
      if (!isRoleKey(collaborator.roleKey)) {
        logger.warn({ event: 'access.unknown_role', collaboratorId }, 'Unknown role key ignored');
        return { role: { type: 'explicit' }, permissions: Object.freeze([]) };
      }
      return {
        role: { type: 'predefined', key: collaborator.roleKey },
        permissions: permissionsOfRole(collaborator.roleKey),
      };
    }
    if (isSet(collaborator.customRoleId)) {
      const customRoleId = String(collaborator.customRoleId);
      const customRole = await CustomRole.findOne(
        { _id: customRoleId, organizationId: String(collaborator.organizationId), deletedAt: null },
        { permissions: 1 },
      ).lean();
      if (!customRole) {
        logger.warn(
          { event: 'access.custom_role_missing', collaboratorId, customRoleId },
          'Custom role not found in the organization: no permission granted',
        );
        return { role: { type: 'custom', customRoleId }, permissions: Object.freeze([]) };
      }
      return {
        role: { type: 'custom', customRoleId },
        permissions: knownPermissions(customRole.permissions, { customRoleId }),
      };
    }
    return {
      role: { type: 'explicit' },
      permissions: knownPermissions(collaborator.permissions ?? [], { collaboratorId }),
    };
  }

  /**
   * @param {AccessKey} key
   * @returns {Promise<EventAccess | null>}
   */
  async function load({ eventId, userId }) {
    const collaborator = await Collaborator.findOne(
      { eventId, userId, status: 'active' },
      { organizationId: 1, roleKey: 1, customRoleId: 1, permissions: 1 },
    ).lean();
    if (!collaborator) {
      return null;
    }
    return Object.freeze({
      eventId,
      organizationId: String(collaborator.organizationId),
      collaboratorId: String(collaborator._id),
      ...(await resolveRole(collaborator)),
    });
  }

  return {
    /**
     * @param {AccessKey} key
     * @returns {Promise<EventAccess | null>}
     */
    resolve(key) {
      return cache.get(key, () => load(key));
    },

    /**
     * À appeler après la validation de toute transaction qui change un rôle ou révoque un
     * accès, jamais pendant : une transaction rejouée ou annulée ne doit pas laisser le cache
     * dans un autre état que la base.
     *
     * @param {ReadonlyArray<AccessKey>} keys
     * @returns {Promise<void>}
     */
    invalidate(keys) {
      return cache.invalidate(keys);
    },
  };
}

/** @typedef {ReturnType<typeof createPermissionResolver>} PermissionResolver */
