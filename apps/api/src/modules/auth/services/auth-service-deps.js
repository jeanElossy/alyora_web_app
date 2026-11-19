// Dépendances et utilitaires communs aux services d'authentification.

/**
 * @typedef {object} AuthServiceDeps
 * @property {{ now: () => Date }} clock
 * @property {import('pino').Logger} logger
 * @property {import('../../../lib/mail/mail-queue.js').Mailer} mailer
 * @property {import('../auth-emails.js').AuthEmails} emails
 * @property {import('../../../lib/auth/password-hasher.js').PasswordHasher} passwordHasher
 * @property {import('../../../lib/auth/access-token.js').AccessTokens} accessTokens
 * @property {import('../../../lib/crypto/keyed-hash.js').KeyedHasher} keyedHasher
 */

/** @typedef {import('../../../lib/context/service-context.js').ServiceContext} ServiceContext */

/**
 * Met un e-mail en file d'attente sans jamais faire échouer l'opération qui l'envoie : elle
 * est déjà validée en base, et la réponse ne doit pas varier selon que l'e-mail part ou non
 * (elle révélerait l'existence d'un compte). Un échec est journalisé, sans destinataire.
 *
 * @param {Pick<AuthServiceDeps, 'mailer' | 'logger'>} deps
 * @param {import('../../../lib/mail/mail-queue.js').MailMessage} message
 * @param {string} event Nature de l'e-mail, pour le log.
 * @returns {Promise<void>}
 */
export async function sendSafely({ mailer, logger }, message, event) {
  try {
    await mailer.send(message);
  } catch (error) {
    logger.error({ err: error, event }, 'Unable to queue an email');
  }
}

/**
 * Champs d'un compte lus pour la vue « mon compte ».
 *
 * @typedef {object} ProfileFields
 * @property {import('mongoose').Types.ObjectId} _id
 * @property {string} email
 * @property {string} firstName
 * @property {string} lastName
 * @property {string | null} [phone]
 * @property {'individual' | 'professional'} accountType
 * @property {Date | null} [emailVerifiedAt]
 * @property {Date | null} [phoneVerifiedAt]
 * @property {boolean | null} [twoFactorEnabled]
 * @property {string | null} [avatarUrl]
 * @property {string | null} [locale]
 * @property {string | null} [timezone]
 * @property {Date} createdAt
 */

/**
 * Le compte tel que le voit son titulaire : jamais de hash, de secret ni de compteur interne.
 *
 * @param {ProfileFields} user
 * @returns {import('@alyora/shared/schemas').CurrentUser}
 */
export function toCurrentUser(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? null,
    accountType: user.accountType,
    emailVerified: Boolean(user.emailVerifiedAt),
    phoneVerified: Boolean(user.phoneVerifiedAt),
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    avatarUrl: user.avatarUrl ?? null,
    locale: 'fr',
    timezone: user.timezone ?? 'Africa/Abidjan',
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * @param {Date} date
 * @returns {number} En secondes (claim auth_time).
 */
export function toEpochSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}
