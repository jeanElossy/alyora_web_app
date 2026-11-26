import { User } from '../../auth/models/user.model.js';

/** @typedef {import('./role-assignment.js').ResolvedRole} ResolvedRole */

/**
 * Noms des comptes, par identifiant. users est une collection de plateforme, filtrée par _id
 * (ADR 0004) : l'équipe d'un événement voit le nom de ses membres, jamais leur adresse.
 *
 * @param {string[]} userIds
 * @param {import('mongoose').ClientSession | null} [session]
 * @returns {Promise<Map<string, { firstName: string, lastName: string }>>}
 */
async function namesOf(userIds, session = null) {
  if (userIds.length === 0) {
    return new Map();
  }
  const users = await User.find({ _id: { $in: userIds } }, { firstName: 1, lastName: 1 })
    .session(session)
    .lean();
  return new Map(
    users.map((user) => [String(user._id), { firstName: user.firstName, lastName: user.lastName }]),
  );
}

/**
 * @typedef {object} CollaboratorRecord
 * @property {unknown} _id
 * @property {unknown} userId
 * @property {unknown} [invitedBy]
 * @property {Date} acceptedAt
 */

/**
 * Collaborateurs tels que l'API les décrit, avec leur rôle résolu (même ordre).
 *
 * @param {ReadonlyArray<CollaboratorRecord>} records
 * @param {ReadonlyArray<ResolvedRole>} resolved
 * @param {import('mongoose').ClientSession | null} [session]
 * @returns {Promise<import('@alyora/shared').Collaborator[]>}
 */
export async function toCollaboratorViews(records, resolved, session = null) {
  const names = await namesOf(
    [...new Set(records.map((record) => String(record.userId)))],
    session,
  );
  return records.map((record, index) => {
    const name = names.get(String(record.userId));
    const { role, permissions } = /** @type {ResolvedRole} */ (resolved[index]);
    return {
      id: String(record._id),
      userId: String(record.userId),
      firstName: name?.firstName ?? '',
      lastName: name?.lastName ?? '',
      role,
      permissions: [...permissions],
      invitedBy: record.invitedBy ? String(record.invitedBy) : null,
      acceptedAt: record.acceptedAt.toISOString(),
    };
  });
}

/**
 * @typedef {object} InvitationRecord
 * @property {unknown} _id
 * @property {string} email
 * @property {unknown} invitedBy
 * @property {Date} expiresAt
 * @property {Date} createdAt
 */

/**
 * Une invitation en attente, telle que l'API la décrit : jamais son jeton ni son empreinte.
 *
 * @param {InvitationRecord} record
 * @param {ResolvedRole} resolved
 * @param {Date} now
 * @returns {import('@alyora/shared').Invitation}
 */
export function toInvitationView(record, { role, permissions }, now) {
  return {
    id: String(record._id),
    email: record.email,
    role,
    permissions: [...permissions],
    invitedBy: String(record.invitedBy),
    status: record.expiresAt.getTime() <= now.getTime() ? 'expired' : 'pending',
    expiresAt: record.expiresAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Une page d'une liste par curseur : `limit + 1` documents lus disent s'il y a une suite.
 *
 * @template {{ _id: unknown }} T
 * @param {T[]} records Au plus limit + 1 documents, triés par _id.
 * @param {number} limit
 * @returns {{ page: T[], nextCursor: string | null }}
 */
export function cursorPage(records, limit) {
  const page = records.slice(0, limit);
  const last = page.at(-1);
  return { page, nextCursor: records.length > limit && last ? String(last._id) : null };
}
