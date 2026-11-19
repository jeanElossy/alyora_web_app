import { PASSWORD_RESET_TTL_SECONDS } from '@alyora/shared';
import { hashToken } from '../../../lib/crypto/random-token.js';
import { withTransaction } from '../../../lib/db/transaction.js';
import { AppError } from '../../../lib/errors/app-error.js';
import { User } from '../models/user.model.js';
import { VerificationToken } from '../models/verification-token.model.js';
import { assertAcceptablePassword } from '../password-policy.js';
import { sendSafely } from './auth-service-deps.js';
import { consumeEmailedToken, replaceEmailedToken } from './email-verification.service.js';
import { revokeSessions } from './session-tokens.js';

/** @typedef {import('./auth-service-deps.js').AuthServiceDeps} AuthServiceDeps */
/** @typedef {import('./auth-service-deps.js').ServiceContext} ServiceContext */

/**
 * Mot de passe oublié et réinitialisation.
 *
 * @param {AuthServiceDeps} deps
 */
export function createPasswordResetService(deps) {
  const { clock, passwordHasher, emails, logger } = deps;

  return {
    /**
     * Envoie un lien de réinitialisation (1 h, usage unique) si l'adresse a un compte actif.
     * Toujours la même réponse : rien ne révèle l'existence d'un compte.
     *
     * @param {ServiceContext} _context
     * @param {import('@alyora/shared/schemas').EmailRequest} input
     * @returns {Promise<void>}
     */
    async requestReset(_context, { email }) {
      const user = await User.findOne(
        { email, deletedAt: null, status: 'active' },
        { email: 1, firstName: 1, timezone: 1 },
      ).lean();
      if (!user) {
        return;
      }
      const now = clock.now();
      const token = await withTransaction((session) =>
        replaceEmailedToken(session, user._id, 'reset', PASSWORD_RESET_TTL_SECONDS, now),
      );
      logger.info(
        { event: 'auth.password_reset_requested', userId: user._id.toString() },
        'Password reset requested',
      );
      await sendSafely(deps, emails.resetPassword(user, token), 'reset_password');
    },

    /**
     * Remplace le mot de passe avec un jeton de réinitialisation. Dans une seule transaction :
     * le jeton est consommé (une seule fois, même sous requêtes simultanées), le mot de passe
     * remplacé, le verrouillage levé, et toutes les sessions du compte révoquées. L'adresse est
     * tenue pour vérifiée : le lien a été ouvert depuis sa boîte.
     *
     * @param {ServiceContext} _context
     * @param {import('@alyora/shared/schemas').ResetPasswordRequest} input
     * @returns {Promise<void>}
     * @throws {AppError} INVALID_TOKEN, ou VALIDATION_ERROR pour un mot de passe refusé.
     */
    async reset(_context, { token, password }) {
      const now = clock.now();
      // Lecture préalable, sans consommer : un mot de passe refusé laisse le lien utilisable.
      const pending = await VerificationToken.findOne(
        {
          tokenHash: hashToken(token),
          purpose: 'reset',
          consumedAt: null,
          expiresAt: { $gt: now },
        },
        { userId: 1 },
      ).lean();
      const account = pending
        ? await User.findOne(
            { _id: pending.userId, deletedAt: null, status: 'active' },
            { email: 1, firstName: 1, lastName: 1, timezone: 1 },
          ).lean()
        : null;
      if (!account) {
        throw new AppError('INVALID_TOKEN');
      }
      assertAcceptablePassword(password, account);
      const passwordHash = await passwordHasher.hash(password);

      await withTransaction(async (session) => {
        const consumed = await consumeEmailedToken(session, token, 'reset', now);
        if (!consumed || !consumed.userId.equals(account._id)) {
          throw new AppError('INVALID_TOKEN');
        }
        await User.updateOne(
          { _id: account._id, deletedAt: null },
          {
            $set: {
              passwordHash,
              passwordChangedAt: now,
              failedLoginCount: 0,
              lockedUntil: null,
              lockoutCount: 0,
            },
          },
          { session },
        );
        await User.updateOne(
          { _id: account._id, emailVerifiedAt: null },
          { $set: { emailVerifiedAt: now } },
          { session },
        );
        await revokeSessions(session, { userId: account._id }, 'password_reset', now);
      });
      logger.info(
        { event: 'auth.password_reset', userId: account._id.toString() },
        'Password reset: every session revoked',
      );
      await sendSafely(deps, emails.passwordChanged(account, now), 'password_changed');
    },
  };
}
