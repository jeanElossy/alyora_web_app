import { isSensitiveKey } from '../logger/redact.js';
import { AUDIT_USER_AGENT_MAX_LENGTH, AuditLog } from './audit-log.model.js';

/** Profondeur maximale d'un instantané : il décrit un état, pas un document entier. */
const SNAPSHOT_MAX_DEPTH = 4;

/**
 * @typedef {object} AuditEntry
 * @property {import('./audit-actions.js').AuditAction} action
 * @property {import('./audit-actions.js').AuditTargetType} targetType
 * @property {string | import('mongoose').Types.ObjectId} targetId
 * @property {Record<string, unknown> | null} [before] État avant l'action.
 * @property {Record<string, unknown> | null} [after] État après l'action.
 * @property {string | null} [eventId] Par défaut, l'événement du contexte.
 * @property {string | null} [organizationId] Par défaut, l'organisation du contexte.
 */

/**
 * Service d'audit : la seule façon d'écrire dans audit_logs. Chaque entrée est écrite dans la
 * session transactionnelle du contexte, donc avec l'action qu'elle décrit : une action annulée
 * ne laisse pas de trace, une action validée en laisse toujours une.
 *
 * Les instantanés `before` et `after` ne peuvent contenir aucun champ sensible (jeton, mot de
 * passe, e-mail, téléphone, note...), reconnu par son nom comme dans les logs : ils
 * décrivent des rôles et des statuts, jamais des données personnelles.
 *
 * @param {object} deps
 * @param {import('../crypto/keyed-hash.js').KeyedHasher} deps.keyedHasher
 * @param {{ now: () => Date }} deps.clock
 */
export function createAuditLog({ keyedHasher, clock }) {
  return {
    /**
     * @param {import('../context/service-context.js').ServiceContext} context
     * @param {AuditEntry} entry
     * @returns {Promise<void>}
     */
    async record(context, entry) {
      if (!context.session) {
        throw new Error('auditLog.record(): must run in the transaction of the audited change');
      }
      const organizationId = entry.organizationId ?? context.organizationId;
      if (!organizationId) {
        throw new Error('auditLog.record(): organizationId is required');
      }
      const before = entry.before ?? null;
      const after = entry.after ?? null;
      assertSafeSnapshot(before, 'before');
      assertSafeSnapshot(after, 'after');
      const { ip, userAgent } = context.client;
      await AuditLog.create(
        [
          {
            organizationId,
            eventId: entry.eventId === undefined ? context.eventId : entry.eventId,
            actorId: context.userId,
            action: entry.action,
            targetType: entry.targetType,
            targetId: entry.targetId,
            before,
            after,
            ipHash: ip ? keyedHasher.digest('ip', ip) : null,
            userAgent: userAgent.slice(0, AUDIT_USER_AGENT_MAX_LENGTH),
            createdAt: clock.now(),
          },
        ],
        { session: context.session },
      );
    },
  };
}

/** @typedef {ReturnType<typeof createAuditLog>} AuditLogService */

/**
 * @param {unknown} value
 * @param {string} path
 * @param {number} [depth]
 */
function assertSafeSnapshot(value, path, depth = 0) {
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (depth > SNAPSHOT_MAX_DEPTH) {
    throw new Error(`auditLog.record(): snapshot too deep at ${path}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeSnapshot(item, `${path}.${index}`, depth + 1));
    return;
  }
  // Un ObjectId, une date : une valeur, pas un objet à parcourir.
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      throw new Error(`auditLog.record(): sensitive field in snapshot: ${path}.${key}`);
    }
    assertSafeSnapshot(item, `${path}.${key}`, depth + 1);
  }
}
