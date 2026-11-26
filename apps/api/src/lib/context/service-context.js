/**
 * Contexte explicite que reçoit chaque service : qui agit, sur quel événement, avec quelles
 * permissions, dans quelle session transactionnelle MongoDB. Un service ne lit jamais `req` :
 * le controller construit ce contexte, et un test le construit sans Express.
 *
 * @typedef {object} ServiceContext
 * @property {string | null} userId Compte authentifié, null pour une route publique.
 * @property {string | null} eventId Événement concerné, null hors événement (authentification).
 * @property {string | null} organizationId Organisation de l'événement, null hors événement.
 * @property {ReadonlyArray<import('@alyora/shared').Permission>} permissions Permissions de
 *   l'appelant sur l'événement, résolues par requirePermission.
 * @property {import('mongoose').ClientSession | null} session Session transactionnelle MongoDB
 *   ouverte par l'appelant, ou null : le service ouvre alors la sienne s'il en a besoin.
 * @property {string | null} authSessionId Session d'authentification (appareil) de l'appelant.
 * @property {{ ip: string, userAgent: string }} client Origine de la requête. L'IP n'est jamais
 *   stockée en clair, seulement son empreinte à clé.
 */

/**
 * @param {object} values
 * @param {string | null} [values.userId]
 * @param {string | null} [values.authSessionId]
 * @param {string | null} [values.eventId]
 * @param {string | null} [values.organizationId]
 * @param {ReadonlyArray<import('@alyora/shared').Permission>} [values.permissions]
 * @param {string} [values.ip]
 * @param {string} [values.userAgent]
 * @returns {Readonly<ServiceContext>}
 */
export function createServiceContext({
  userId = null,
  authSessionId = null,
  eventId = null,
  organizationId = null,
  permissions = [],
  ip = '',
  userAgent = '',
} = {}) {
  return Object.freeze({
    userId,
    eventId,
    organizationId,
    permissions: Object.freeze([...permissions]),
    session: null,
    authSessionId,
    client: Object.freeze({ ip, userAgent }),
  });
}

/**
 * L'événement du contexte, pour un service qui ne travaille que sur un événement : un
 * contexte sans événement est une erreur de programmation (route sans requirePermission).
 *
 * @param {Readonly<ServiceContext>} context
 * @returns {string}
 */
export function eventIdOf(context) {
  if (!context.eventId) {
    throw new Error('eventIdOf(): the service context has no event');
  }
  return context.eventId;
}

/**
 * Le même contexte, rattaché à une session transactionnelle : ce que reçoivent les étapes
 * d'une transaction (écritures, journal d'audit).
 *
 * @param {Readonly<ServiceContext>} context
 * @param {import('mongoose').ClientSession} session
 * @returns {Readonly<ServiceContext>}
 */
export function withSession(context, session) {
  return Object.freeze({ ...context, session });
}
