import { eventIdOf, withSession } from '../../../lib/context/service-context.js';
import { withTransaction } from '../../../lib/db/transaction.js';
import { AppError } from '../../../lib/errors/app-error.js';
import { Collaborator } from '../models/collaborator.model.js';
import { cursorPage, toCollaboratorViews } from './collaboration-views.js';
import { assertCanGrant, assertCanManage, loadActor } from './escalation.js';
import {
  assignmentFields,
  assignmentUpdate,
  describeRole,
  grantedPermissions,
  resolveAssignments,
  roleSnapshot,
} from './role-assignment.js';

/** @typedef {import('../../../lib/context/service-context.js').ServiceContext} ServiceContext */

/**
 * @typedef {object} CollaborationServiceDeps
 * @property {{ now: () => Date }} clock
 * @property {import('pino').Logger} logger
 * @property {import('../../../lib/audit/audit-log.js').AuditLogService} auditLog
 * @property {import('./permission-resolver.js').PermissionResolver} resolver
 */

/**
 * L'équipe d'un événement : liste, changement de rôle, révocation. Chaque changement passe
 * par la règle d'escalade, avec les permissions de l'acteur lues dans la transaction ; il est
 * journalisé dans la même transaction, et le cache des permissions de la cible est invalidé
 * après la validation.
 *
 * @param {CollaborationServiceDeps} deps
 */
export function createCollaboratorService({ clock, logger, auditLog, resolver }) {
  /**
   * Un collaborateur actif de l'événement du contexte, et son rôle effectif.
   *
   * @param {ServiceContext} context
   * @param {string} collaboratorId
   */
  async function loadTarget(context, collaboratorId) {
    const record = await Collaborator.findOne({
      _id: collaboratorId,
      eventId: eventIdOf(context),
      status: 'active',
    })
      .session(context.session)
      .lean();
    if (!record) {
      throw new AppError('NOT_FOUND');
    }
    const [resolved] = await resolveAssignments([record], {
      organizationId: String(record.organizationId),
      logger,
      session: context.session,
    });
    return {
      record,
      userId: String(record.userId),
      .../** @type {import('./role-assignment.js').ResolvedRole} */ (resolved),
    };
  }

  /**
   * @param {ServiceContext} context
   * @param {string} collaboratorId
   */
  async function view(context, collaboratorId) {
    const { record, role, permissions } = await loadTarget(context, collaboratorId);
    const [collaborator] = await toCollaboratorViews([record], [{ role, permissions }]);
    return /** @type {import('@alyora/shared').Collaborator} */ (collaborator);
  }

  return {
    /**
     * Les collaborateurs actifs, par page (curseur).
     *
     * @param {ServiceContext} context
     * @param {import('@alyora/shared').CursorPageQuery} query
     */
    async list(context, { cursor, limit }) {
      const records = await Collaborator.find({
        eventId: eventIdOf(context),
        status: 'active',
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
      return { items: await toCollaboratorViews(page, resolved), nextCursor };
    },

    /**
     * Remplace le rôle d'un collaborateur.
     *
     * @param {ServiceContext} context
     * @param {string} collaboratorId
     * @param {{ role: import('@alyora/shared').RoleAssignment }} input
     */
    async update(context, collaboratorId, { role }) {
      const eventId = eventIdOf(context);
      const target = await withTransaction(async (session) => {
        const tx = withSession(context, session);
        const actor = await loadActor(resolver, tx);
        const current = await loadTarget(tx, collaboratorId);
        assertCanManage(actor, current);
        const permissions = await grantedPermissions(role, {
          organizationId: actor.organizationId,
          session,
        });
        assertCanGrant(actor, { role, permissions });
        await Collaborator.updateOne(
          { _id: collaboratorId, eventId, status: 'active' },
          assignmentUpdate(role),
          { session },
        );
        await auditLog.record(tx, {
          action: 'collaborator.permissions_changed',
          targetType: 'collaborator',
          targetId: collaboratorId,
          before: roleSnapshot(current.role, current.permissions),
          after: roleSnapshot(describeRole(assignmentFields(role)), permissions),
        });
        return current;
      });
      await resolver.invalidate([{ eventId, userId: target.userId }]);
      return view(context, collaboratorId);
    },

    /**
     * Révoque l'accès d'un collaborateur : logique et immédiate (le cache est invalidé).
     *
     * @param {ServiceContext} context
     * @param {string} collaboratorId
     * @returns {Promise<void>}
     */
    async revoke(context, collaboratorId) {
      const eventId = eventIdOf(context);
      const now = clock.now();
      const target = await withTransaction(async (session) => {
        const tx = withSession(context, session);
        const actor = await loadActor(resolver, tx);
        const current = await loadTarget(tx, collaboratorId);
        assertCanManage(actor, current);
        await Collaborator.updateOne(
          { _id: collaboratorId, eventId, status: 'active' },
          { $set: { status: 'revoked', revokedAt: now, revokedBy: actor.userId } },
          { session },
        );
        await auditLog.record(tx, {
          action: 'collaborator.revoked',
          targetType: 'collaborator',
          targetId: collaboratorId,
          before: roleSnapshot(current.role, current.permissions),
          after: { status: 'revoked' },
        });
        return current;
      });
      await resolver.invalidate([{ eventId, userId: target.userId }]);
    },
  };
}

/** @typedef {ReturnType<typeof createCollaboratorService>} CollaboratorService */
