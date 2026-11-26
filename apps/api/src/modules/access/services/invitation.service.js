import { INVITATION_TTL_SECONDS, isSubsetOf } from '@alyora/shared';
import { eventIdOf, withSession } from '../../../lib/context/service-context.js';
import { generateToken, hashToken } from '../../../lib/crypto/random-token.js';
import { isDuplicateKeyError, withTransaction } from '../../../lib/db/transaction.js';
import { AppError } from '../../../lib/errors/app-error.js';
import { sendSafely } from '../../../lib/mail/compose-email.js';
import { User } from '../../auth/models/user.model.js';
import { CollaborationInvitation } from '../models/collaboration-invitation.model.js';
import { Collaborator } from '../models/collaborator.model.js';
import { cursorPage, toInvitationView } from './collaboration-views.js';
import { assertCanGrant, loadActor } from './escalation.js';
import {
  assignmentFields,
  describeRole,
  grantedPermissions,
  resolveAssignments,
  roleSnapshot,
} from './role-assignment.js';

/** @typedef {import('../../../lib/context/service-context.js').ServiceContext} ServiceContext */

/** Aléa d'un jeton d'invitation : 128 bits (22 caractères en base64url). */
export const INVITATION_TOKEN_BYTES = 16;

/**
 * @typedef {import('./collaborator.service.js').CollaborationServiceDeps & {
 *   mailer: import('../../../lib/mail/mail-queue.js').Mailer,
 *   emails: import('../access-emails.js').AccessEmails,
 * }} InvitationServiceDeps
 */

/**
 * Invitations à rejoindre l'équipe d'un événement : création, liste, révocation (l'acceptation
 * est dans invitation-acceptance.service.js). Le jeton n'existe en clair que dans l'e-mail ;
 * la base n'en garde que l'empreinte.
 *
 * @param {InvitationServiceDeps} deps
 */
export function createInvitationService(deps) {
  const { clock, logger, auditLog, resolver } = deps;

  /**
   * Refuse d'inviter une adresse qui a déjà accès à l'événement.
   *
   * @param {string} eventId
   * @param {string} email
   * @param {import('mongoose').ClientSession} session
   */
  async function assertNotCollaborator(eventId, email, session) {
    const user = await User.findOne({ email, deletedAt: null }, { _id: 1 }).session(session).lean();
    if (
      user &&
      (await Collaborator.exists({ eventId, userId: user._id, status: 'active' }).session(session))
    ) {
      throw new AppError('COLLABORATOR_CONFLICT');
    }
  }

  /**
   * L'e-mail d'invitation, après la validation : un échec est journalisé sans annuler
   * l'invitation (elle peut être révoquée puis refaite).
   *
   * @param {ServiceContext} context
   * @param {{ email: string, token: string }} invitation
   */
  async function sendInvitation(context, { email, token }) {
    const [inviter, recipient] = await Promise.all([
      User.findOne({ _id: context.userId }, { firstName: 1, lastName: 1 }).lean(),
      User.findOne({ email, deletedAt: null }, { firstName: 1, locale: 1 }).lean(),
    ]);
    const message = deps.emails.invitation(
      { email, firstName: recipient?.firstName ?? null, locale: recipient?.locale ?? null },
      {
        inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : '',
        eventId: eventIdOf(context),
        token,
      },
    );
    await sendSafely(deps, message, 'collaboration_invitation');
  }

  return {
    /**
     * Les invitations en attente (y compris celles dont la validité est passée), par page.
     *
     * @param {ServiceContext} context
     * @param {import('@alyora/shared').CursorPageQuery} query
     */
    async list(context, { cursor, limit }) {
      const records = await CollaborationInvitation.find({
        eventId: eventIdOf(context),
        status: 'pending',
        ...(cursor ? { _id: { $gt: cursor } } : {}),
      })
        .sort({ _id: 1 })
        .limit(limit + 1)
        .lean();
      const { page, nextCursor } = cursorPage(records, limit);
      const resolved = await resolveAssignments(page, {
        organizationId: /** @type {string} */ (context.organizationId),
        logger,
      });
      const now = clock.now();
      return {
        items: page.map((record, index) =>
          toInvitationView(record, /** @type {(typeof resolved)[number]} */ (resolved[index]), now),
        ),
        nextCursor,
      };
    },

    /**
     * Invite une adresse, avec un rôle que l'acteur peut accorder (règle d'escalade).
     *
     * @param {ServiceContext} context
     * @param {import('@alyora/shared').CreateInvitationRequest} input
     */
    async create(context, { email, role }) {
      const eventId = eventIdOf(context);
      const now = clock.now();
      const token = generateToken(INVITATION_TOKEN_BYTES);
      const expiresAt = new Date(now.getTime() + INVITATION_TTL_SECONDS * 1000);
      /** @type {{ record: import('./collaboration-views.js').InvitationRecord, permissions: ReadonlyArray<import('@alyora/shared').Permission> }} */
      let created;
      try {
        created = await withTransaction(async (session) => {
          const tx = withSession(context, session);
          const actor = await loadActor(resolver, tx);
          const permissions = await grantedPermissions(role, {
            organizationId: actor.organizationId,
            session,
          });
          assertCanGrant(actor, { role, permissions });
          await assertNotCollaborator(eventId, email, session);
          // Une invitation en attente mais périmée ne bloque plus l'adresse.
          await CollaborationInvitation.updateMany(
            { eventId, email, status: 'pending', expiresAt: { $lte: now } },
            { $set: { status: 'expired' } },
            { session },
          );
          const [record] = await CollaborationInvitation.create(
            [
              {
                eventId,
                organizationId: actor.organizationId,
                email,
                ...assignmentFields(role),
                invitedBy: actor.userId,
                tokenHash: hashToken(token),
                status: 'pending',
                expiresAt,
              },
            ],
            { session },
          );
          await auditLog.record(tx, {
            action: 'invitation.created',
            targetType: 'invitation',
            targetId: record._id,
            after: roleSnapshot(describeRole(assignmentFields(role)), permissions),
          });
          return { record, permissions };
        });
      } catch (error) {
        // Une invitation en attente pour cette adresse (index unique, dernier rempart).
        if (isDuplicateKeyError(error)) {
          throw new AppError('COLLABORATOR_CONFLICT');
        }
        throw error;
      }
      await sendInvitation(context, { email, token });
      return toInvitationView(
        created.record,
        { role: describeRole(assignmentFields(role)), permissions: created.permissions },
        now,
      );
    },

    /**
     * Révoque une invitation en attente. Elle ne doit accorder rien de plus que ce que détient
     * l'acteur (règle d'escalade).
     *
     * @param {ServiceContext} context
     * @param {string} invitationId
     * @returns {Promise<void>}
     */
    async revoke(context, invitationId) {
      const eventId = eventIdOf(context);
      const now = clock.now();
      await withTransaction(async (session) => {
        const tx = withSession(context, session);
        const actor = await loadActor(resolver, tx);
        const invitation = await CollaborationInvitation.findOne({
          _id: invitationId,
          eventId,
          status: 'pending',
        })
          .session(session)
          .lean();
        if (!invitation) {
          throw new AppError('NOT_FOUND');
        }
        const [resolved] = await resolveAssignments([invitation], {
          organizationId: actor.organizationId,
          logger,
          session,
        });
        const { role, permissions } = /** @type {import('./role-assignment.js').ResolvedRole} */ (
          resolved
        );
        if (!isSubsetOf(permissions, actor.permissions)) {
          throw new AppError('PERMISSION_ESCALATION');
        }
        await CollaborationInvitation.updateOne(
          { _id: invitationId, eventId, status: 'pending' },
          { $set: { status: 'revoked', revokedAt: now, revokedBy: actor.userId } },
          { session },
        );
        await auditLog.record(tx, {
          action: 'invitation.revoked',
          targetType: 'invitation',
          targetId: invitationId,
          before: roleSnapshot(role, permissions),
          after: { status: 'revoked' },
        });
      });
    },
  };
}

/** @typedef {ReturnType<typeof createInvitationService>} InvitationService */
