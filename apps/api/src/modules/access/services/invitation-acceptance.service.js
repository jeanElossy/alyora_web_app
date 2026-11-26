import { isSubsetOf } from '@alyora/shared';
import { eventIdOf, withSession } from '../../../lib/context/service-context.js';
import { hashToken } from '../../../lib/crypto/random-token.js';
import { isDuplicateKeyError, withTransaction } from '../../../lib/db/transaction.js';
import { AppError } from '../../../lib/errors/app-error.js';
import { User } from '../../auth/models/user.model.js';
import { CollaborationInvitation } from '../models/collaboration-invitation.model.js';
import { Collaborator } from '../models/collaborator.model.js';
import { toCollaboratorViews } from './collaboration-views.js';
import { isOwnerAssignment, resolveAssignments, roleSnapshot } from './role-assignment.js';

/** @typedef {import('../../../lib/context/service-context.js').ServiceContext} ServiceContext */

/**
 * Acceptation d'une invitation par le compte connecté. Le jeton est consommé une seule fois
 * (mise à jour conditionnelle), et l'accès créé est unique (index unique), si bien que des
 * acceptations simultanées ne créent qu'un collaborateur.
 *
 * Une invitation n'est acceptée que :
 * - pour l'adresse invitée, celle du compte connecté (vérifiée par requireAuth) ;
 * - si l'inviteur est encore collaborateur et détient encore tout ce qu'elle accorde : un
 *   inviteur révoqué ou rétrogradé entre-temps ne fait entrer personne (règle d'escalade, au
 *   moment de l'acceptation).
 *
 * Jeton inconnu, expiré, révoqué, déjà accepté ou dont l'inviteur n'a plus les droits :
 * INVALID_TOKEN, sans dire lequel.
 *
 * @param {import('./collaborator.service.js').CollaborationServiceDeps} deps
 */
export function createInvitationAcceptanceService({ clock, logger, auditLog, resolver }) {
  return {
    /**
     * @param {ServiceContext} context Compte connecté et événement de l'invitation.
     * @param {{ token: string }} input
     * @returns {Promise<import('@alyora/shared').Collaborator>}
     */
    async accept(context, { token }) {
      const eventId = eventIdOf(context);
      const userId = /** @type {string} */ (context.userId);
      const now = clock.now();
      /** @type {{ record: import('./collaboration-views.js').CollaboratorRecord, resolved: import('./role-assignment.js').ResolvedRole }} */
      let accepted;
      try {
        accepted = await withTransaction(async (session) => {
          const invitation = await CollaborationInvitation.findOne({
            eventId,
            tokenHash: hashToken(token),
          })
            .session(session)
            .lean();
          if (
            !invitation ||
            invitation.status !== 'pending' ||
            invitation.expiresAt.getTime() <= now.getTime()
          ) {
            throw new AppError('INVALID_TOKEN');
          }
          const user = await User.findOne({ _id: userId, deletedAt: null }, { email: 1 })
            .session(session)
            .lean();
          if (!user || user.email !== invitation.email) {
            throw new AppError('INVITATION_EMAIL_MISMATCH');
          }
          const organizationId = String(invitation.organizationId);
          const [resolved] = await resolveAssignments([invitation], {
            organizationId,
            logger,
            session,
          });
          const grant = /** @type {import('./role-assignment.js').ResolvedRole} */ (resolved);
          const inviter = await resolver.resolveFresh(
            { eventId, userId: String(invitation.invitedBy) },
            session,
          );
          if (
            !inviter ||
            isOwnerAssignment(grant.role) ||
            !isSubsetOf(grant.permissions, inviter.permissions)
          ) {
            throw new AppError('INVALID_TOKEN');
          }
          if (await Collaborator.exists({ eventId, userId, status: 'active' }).session(session)) {
            throw new AppError('COLLABORATOR_CONFLICT');
          }
          const consumed = await CollaborationInvitation.updateOne(
            { _id: invitation._id, eventId, status: 'pending' },
            { $set: { status: 'accepted', acceptedAt: now, acceptedBy: userId } },
            { session },
          );
          if (consumed.modifiedCount !== 1) {
            throw new AppError('INVALID_TOKEN');
          }
          const [record] = await Collaborator.create(
            [
              {
                eventId,
                organizationId,
                userId,
                roleKey: invitation.roleKey ?? null,
                customRoleId: invitation.customRoleId ?? null,
                ...(invitation.permissions ? { permissions: invitation.permissions } : {}),
                invitedBy: invitation.invitedBy,
                status: 'active',
                acceptedAt: now,
              },
            ],
            { session },
          );
          await auditLog.record(withSession(context, session), {
            action: 'invitation.accepted',
            targetType: 'invitation',
            targetId: invitation._id,
            organizationId,
            after: { collaboratorId: record._id, ...roleSnapshot(grant.role, grant.permissions) },
          });
          return { record, resolved: grant };
        });
      } catch (error) {
        // Un accès actif créé entre-temps pour ce compte (index unique, dernier rempart).
        if (isDuplicateKeyError(error)) {
          throw new AppError('COLLABORATOR_CONFLICT');
        }
        throw error;
      }
      await resolver.invalidate([{ eventId, userId }]);
      const [collaborator] = await toCollaboratorViews([accepted.record], [accepted.resolved]);
      return /** @type {import('@alyora/shared').Collaborator} */ (collaborator);
    },
  };
}

/** @typedef {ReturnType<typeof createInvitationAcceptanceService>} InvitationAcceptanceService */
