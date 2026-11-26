import { FORMER_OWNER_ROLE_KEY, OWNER_ROLE_KEY } from '@alyora/shared';
import { eventIdOf, withSession } from '../../../lib/context/service-context.js';
import { isDuplicateKeyError, withTransaction } from '../../../lib/db/transaction.js';
import { AppError } from '../../../lib/errors/app-error.js';
import { Collaborator } from '../models/collaborator.model.js';
import { loadActor } from './escalation.js';
import { isOwnerAssignment } from './role-assignment.js';

/** @typedef {import('../../../lib/context/service-context.js').ServiceContext} ServiceContext */

/**
 * Transfert de propriété d'un événement : la seule façon de donner le rôle de propriétaire.
 * La route exige une authentification récente et la double authentification active
 * (requireRecentAuth et requireTwoFactorEnabled).
 *
 * Dans une transaction : le propriétaire actuel devient administrateur, puis la cible devient
 * propriétaire. L'index unique « un seul propriétaire actif par événement » est le dernier
 * rempart : deux transferts simultanés n'en laissent passer qu'un.
 *
 * @param {import('./collaborator.service.js').CollaborationServiceDeps} deps
 */
export function createOwnershipService({ auditLog, resolver }) {
  return {
    /**
     * @param {ServiceContext} context
     * @param {{ collaboratorId: string }} input Le collaborateur actif qui devient propriétaire.
     * @returns {Promise<{ ownerCollaboratorId: string, formerOwnerCollaboratorId: string }>}
     */
    async transfer(context, { collaboratorId }) {
      const eventId = eventIdOf(context);
      /** @type {{ formerOwner: string, newOwner: string, formerOwnerCollaboratorId: string }} */
      let users;
      try {
        users = await withTransaction(async (session) => {
          const tx = withSession(context, session);
          const actor = await loadActor(resolver, tx);
          if (!isOwnerAssignment(actor.role)) {
            throw new AppError('FORBIDDEN', { message: 'Only the owner transfers the ownership' });
          }
          if (actor.collaboratorId === collaboratorId) {
            throw new AppError('COLLABORATOR_CONFLICT', { message: 'Already the owner' });
          }
          const target = await Collaborator.findOne({
            _id: collaboratorId,
            eventId,
            status: 'active',
          })
            .session(session)
            .lean();
          if (!target) {
            throw new AppError('NOT_FOUND');
          }
          // D'abord retirer l'ancien propriétaire : l'index unique ne tolère jamais deux
          // propriétaires actifs, même au milieu de la transaction.
          const demoted = await Collaborator.updateOne(
            { _id: actor.collaboratorId, eventId, status: 'active', roleKey: OWNER_ROLE_KEY },
            { $set: { roleKey: FORMER_OWNER_ROLE_KEY, customRoleId: null } },
            { session },
          );
          if (demoted.modifiedCount !== 1) {
            throw new AppError('FORBIDDEN', { message: 'Only the owner transfers the ownership' });
          }
          await Collaborator.updateOne(
            { _id: collaboratorId, eventId, status: 'active' },
            {
              $set: { roleKey: OWNER_ROLE_KEY, customRoleId: null },
              $unset: { permissions: 1 },
            },
            { session },
          );
          await auditLog.record(tx, {
            action: 'ownership.transferred',
            targetType: 'event',
            targetId: eventId,
            before: { ownerCollaboratorId: actor.collaboratorId },
            after: { ownerCollaboratorId: collaboratorId },
          });
          return {
            formerOwner: actor.userId,
            newOwner: String(target.userId),
            formerOwnerCollaboratorId: actor.collaboratorId,
          };
        });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new AppError('COLLABORATOR_CONFLICT', { message: 'Ownership changed meanwhile' });
        }
        throw error;
      }
      await resolver.invalidate([
        { eventId, userId: users.formerOwner },
        { eventId, userId: users.newOwner },
      ]);
      return {
        ownerCollaboratorId: collaboratorId,
        formerOwnerCollaboratorId: users.formerOwnerCollaboratorId,
      };
    },
  };
}

/** @typedef {ReturnType<typeof createOwnershipService>} OwnershipService */
