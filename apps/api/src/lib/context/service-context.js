/**
 * Contexte explicite que reçoit chaque service : qui agit, sur quel événement, avec quelles
 * permissions, dans quelle session transactionnelle MongoDB. Un service ne lit jamais `req` :
 * le controller construit ce contexte, et un test le construit sans Express.
 *
 * @typedef {object} ServiceContext
 * @property {string | null} userId Compte authentifié, null pour une route publique.
 * @property {string | null} eventId Événement concerné, null hors événement (authentification).
 * @property {ReadonlyArray<string>} permissions Permissions de l'appelant sur l'événement.
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
 * @param {string} [values.ip]
 * @param {string} [values.userAgent]
 * @returns {Readonly<ServiceContext>}
 */
export function createServiceContext({
  userId = null,
  authSessionId = null,
  ip = '',
  userAgent = '',
} = {}) {
  return Object.freeze({
    userId,
    eventId: null,
    permissions: Object.freeze([]),
    session: null,
    authSessionId,
    client: Object.freeze({ ip, userAgent }),
  });
}
