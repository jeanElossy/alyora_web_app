/**
 * Actions journalisées dans audit_logs. Une action non listée ici est refusée à l'écriture.
 * Le minimum exigé : changements de permissions, révocations, transfert de propriété, accès
 * aux notes internes, exports.
 */
export const AUDIT_ACTIONS = Object.freeze(
  /** @type {const} */ ([
    'invitation.created',
    'invitation.revoked',
    'invitation.accepted',
    'collaborator.permissions_changed',
    'collaborator.revoked',
    'ownership.transferred',
    'custom_role.created',
    'custom_role.updated',
    'custom_role.deleted',
    'notes.read',
    'export.created',
  ]),
);

/** @typedef {(typeof AUDIT_ACTIONS)[number]} AuditAction */

/** Types de la cible d'une action. */
export const AUDIT_TARGET_TYPES = Object.freeze(
  /** @type {const} */ (['collaborator', 'invitation', 'custom_role', 'event', 'guest', 'export']),
);

/** @typedef {(typeof AUDIT_TARGET_TYPES)[number]} AuditTargetType */
