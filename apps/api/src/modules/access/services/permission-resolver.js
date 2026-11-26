import { Collaborator } from '../models/collaborator.model.js';
import { resolveAssignments } from './role-assignment.js';

/** @typedef {import('../../../lib/auth/require-permission.js').EventAccess} EventAccess */
/** @typedef {{ eventId: string, userId: string }} AccessKey */

/**
 * Résolution des permissions effectives d'un compte sur un événement :
 * 1. le collaborateur actif (eventId, userId) ; aucun : null, soit un 404 ;
 * 2. son rôle prédéfini, son rôle personnalisé (cherché dans l'organisation du collaborateur
 *    seulement) ou sa liste explicite, croisé avec le catalogue (voir role-assignment.js).
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
   * @param {AccessKey} key
   * @param {import('mongoose').ClientSession | null} session
   * @returns {Promise<EventAccess | null>}
   */
  async function load({ eventId, userId }, session) {
    const collaborator = await Collaborator.findOne(
      { eventId, userId, status: 'active' },
      { organizationId: 1, roleKey: 1, customRoleId: 1, permissions: 1 },
    )
      .session(session)
      .lean();
    if (!collaborator) {
      return null;
    }
    const organizationId = String(collaborator.organizationId);
    const [resolved] = await resolveAssignments([collaborator], {
      organizationId,
      logger,
      session,
    });
    return Object.freeze({
      eventId,
      organizationId,
      collaboratorId: String(collaborator._id),
      .../** @type {import('./role-assignment.js').ResolvedRole} */ (resolved),
    });
  }

  return {
    /**
     * Accès d'un compte, depuis le cache (60 s au plus) : ce que lisent les gardes.
     *
     * @param {AccessKey} key
     * @returns {Promise<EventAccess | null>}
     */
    resolve(key) {
      return cache.get(key, () => load(key, null));
    },

    /**
     * Accès d'un compte lu en base, sans cache, dans la transaction en cours : ce qui fait
     * autorité pour une décision qui change des permissions (règle d'escalade).
     *
     * @param {AccessKey} key
     * @param {import('mongoose').ClientSession} session
     * @returns {Promise<EventAccess | null>}
     */
    resolveFresh(key, session) {
      return load(key, session);
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
