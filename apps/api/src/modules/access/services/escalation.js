import { isSubsetOf, missingPermissions } from '@alyora/shared';
import { eventIdOf } from '../../../lib/context/service-context.js';
import { AppError } from '../../../lib/errors/app-error.js';
import { isOwnerAssignment } from './role-assignment.js';

/** @typedef {import('@alyora/shared').Permission} Permission */

/**
 * Un détenteur de permissions sur l'événement : l'acteur d'une opération, ou sa cible.
 *
 * @typedef {object} Holder
 * @property {string} userId
 * @property {{ type: string, key?: unknown }} role
 * @property {ReadonlyArray<Permission>} permissions
 */

/**
 * L'acteur d'une opération qui change des permissions, lu en base dans la transaction (jamais
 * depuis le cache) : la règle d'escalade s'applique à ses permissions du moment.
 *
 * @param {import('./permission-resolver.js').PermissionResolver} resolver
 * @param {import('../../../lib/context/service-context.js').ServiceContext} context Contexte
 *   rattaché à la transaction (withSession).
 * @returns {Promise<import('../../../lib/auth/require-permission.js').EventAccess & { userId: string }>}
 */
export async function loadActor(resolver, context) {
  if (!context.userId || !context.session) {
    throw new Error('loadActor(): needs a signed-in user and a transaction');
  }
  const access = await resolver.resolveFresh(
    { eventId: eventIdOf(context), userId: context.userId },
    context.session,
  );
  if (!access) {
    throw new AppError('NOT_FOUND');
  }
  return { ...access, userId: context.userId };
}

/**
 * Règle d'escalade, pour une invitation ou un changement de rôle : les permissions accordées
 * sont un sous-ensemble (strict ou égal) de celles de l'acteur, sinon PERMISSION_ESCALATION.
 * Le rôle de propriétaire ne s'accorde jamais ainsi, même par le propriétaire : seulement par
 * un transfert de propriété.
 *
 * @param {Pick<Holder, 'permissions'>} actor
 * @param {{ role: { type: string, key?: unknown }, permissions: ReadonlyArray<Permission> }} grant
 */
export function assertCanGrant(actor, { role, permissions }) {
  if (isOwnerAssignment(role)) {
    throw new AppError('PERMISSION_ESCALATION', {
      message: 'The owner role is only given by an ownership transfer',
    });
  }
  const missing = missingPermissions(permissions, actor.permissions);
  if (missing.length > 0) {
    throw new AppError('PERMISSION_ESCALATION', {
      details: {
        issues: [
          {
            path: 'role',
            code: 'permission_escalation',
            message: `Permissions not held: ${missing.join(', ')}`,
          },
        ],
      },
    });
  }
}

/**
 * Peut-on modifier ou révoquer ce collaborateur ?
 * - pas soi-même (FORBIDDEN) : on ne change pas son propre accès ;
 * - pas le propriétaire (FORBIDDEN) : il ne change que par un transfert de propriété ;
 * - pas un collaborateur qui détient des permissions que l'acteur n'a pas
 *   (PERMISSION_ESCALATION) : un administrateur ne touche donc pas au propriétaire.
 *
 * @param {Holder} actor
 * @param {Holder} target
 */
export function assertCanManage(actor, target) {
  if (target.userId === actor.userId) {
    throw new AppError('FORBIDDEN', { message: 'Your own access cannot be changed here' });
  }
  if (isOwnerAssignment(target.role)) {
    throw new AppError('FORBIDDEN', {
      message: 'The owner only changes through an ownership transfer',
    });
  }
  if (!isSubsetOf(target.permissions, actor.permissions)) {
    throw new AppError('PERMISSION_ESCALATION', {
      message: 'This collaborator holds permissions beyond your own',
    });
  }
}
