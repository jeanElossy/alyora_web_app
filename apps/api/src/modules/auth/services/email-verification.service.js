import { EMAIL_VERIFICATION_TTL_SECONDS } from '@alyora/shared';
import { generateToken, hashToken } from '../../../lib/crypto/random-token.js';
import { withTransaction } from '../../../lib/db/transaction.js';
import { AppError } from '../../../lib/errors/app-error.js';
import { User } from '../models/user.model.js';
import { VerificationToken } from '../models/verification-token.model.js';
import { sendSafely } from './auth-service-deps.js';

/** @typedef {import('./auth-service-deps.js').AuthServiceDeps} AuthServiceDeps */
/** @typedef {import('./auth-service-deps.js').ServiceContext} ServiceContext */

/**
 * Consomme un jeton envoyé par e-mail, s'il est valide : bon usage, jamais utilisé, non
 * expiré. Mise à jour conditionnelle, donc atomique : de deux requêtes simultanées avec le
 * même jeton, une seule le consomme.
 *
 * @param {import('mongoose').ClientSession} session
 * @param {string} token
 * @param {'email' | 'reset'} purpose
 * @param {Date} now
 */
export async function consumeEmailedToken(session, token, purpose, now) {
  return VerificationToken.findOneAndUpdate(
    { tokenHash: hashToken(token), purpose, consumedAt: null, expiresAt: { $gt: now } },
    { $set: { consumedAt: now } },
    { session, returnDocument: 'after' },
  ).lean();
}

/**
 * Émet un nouveau jeton d'un usage pour un compte, et invalide (consomme) ceux qui restaient :
 * seul le dernier lien reçu fonctionne.
 *
 * @param {import('mongoose').ClientSession} session
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {'email' | 'reset'} purpose
 * @param {number} ttlSeconds
 * @param {Date} now
 * @returns {Promise<string>} Le jeton en clair, pour l'e-mail.
 */
export async function replaceEmailedToken(session, userId, purpose, ttlSeconds, now) {
  await VerificationToken.updateMany(
    { userId, purpose, consumedAt: null },
    { $set: { consumedAt: now } },
    { session },
  );
  const token = generateToken();
  await VerificationToken.create(
    [
      {
        userId,
        purpose,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      },
    ],
    { session },
  );
  return token;
}

/**
 * Vérification de l'adresse e-mail.
 *
 * @param {AuthServiceDeps} deps
 */
export function createEmailVerificationService(deps) {
  const { clock, emails, logger } = deps;

  return {
    /**
     * @param {ServiceContext} _context
     * @param {import('@alyora/shared/schemas').VerifyEmailRequest} input
     * @returns {Promise<void>}
     * @throws {AppError} INVALID_TOKEN
     */
    async verify(_context, { token }) {
      const now = clock.now();
      const userId = await withTransaction(async (session) => {
        const consumed = await consumeEmailedToken(session, token, 'email', now);
        if (!consumed) {
          throw new AppError('INVALID_TOKEN');
        }
        const user = await User.findOne(
          { _id: consumed.userId, deletedAt: null, status: 'active' },
          { emailVerifiedAt: 1 },
          { session },
        ).lean();
        if (!user) {
          // Annule la transaction : le jeton n'est pas consommé.
          throw new AppError('INVALID_TOKEN');
        }
        await User.updateOne(
          { _id: user._id, emailVerifiedAt: null },
          { $set: { emailVerifiedAt: now } },
          { session },
        );
        return user._id;
      });
      logger.info({ event: 'auth.email_verified', userId: userId.toString() }, 'Email verified');
    },

    /**
     * Renvoie un lien de vérification. Même réponse pour une adresse inconnue, déjà vérifiée
     * ou en attente : rien ne révèle l'existence ni l'état d'un compte.
     *
     * @param {ServiceContext} _context
     * @param {import('@alyora/shared/schemas').EmailRequest} input
     * @returns {Promise<void>}
     */
    async resend(_context, { email }) {
      const user = await User.findOne(
        { email, deletedAt: null, status: 'active', emailVerifiedAt: null },
        { email: 1, firstName: 1, timezone: 1 },
      ).lean();
      if (!user) {
        return;
      }
      const now = clock.now();
      const token = await withTransaction((session) =>
        replaceEmailedToken(session, user._id, 'email', EMAIL_VERIFICATION_TTL_SECONDS, now),
      );
      await sendSafely(deps, emails.verifyEmail(user, token), 'verify_email');
    },
  };
}
