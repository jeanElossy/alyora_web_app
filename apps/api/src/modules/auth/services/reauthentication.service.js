import mongoose from 'mongoose';
import { withTransaction } from '../../../lib/db/transaction.js';
import { AppError } from '../../../lib/errors/app-error.js';
import { AuthSession } from '../models/auth-session.model.js';
import { User } from '../models/user.model.js';
import { assertAcceptablePassword } from '../password-policy.js';
import { sendSafely } from './auth-service-deps.js';
import { requireUserId, revokeSessions, signSessionAccessToken } from './session-tokens.js';

/** @typedef {import('./auth-service-deps.js').AuthServiceDeps} AuthServiceDeps */
/** @typedef {import('./auth-service-deps.js').ServiceContext} ServiceContext */

/**
 * Réauthentification renforcée (avant une opération sensible) et changement du mot de passe.
 *
 * @param {AuthServiceDeps} deps
 * @param {object} collaborators
 * @param {import('./account-lock.js').AccountLock} collaborators.lock
 * @param {import('./second-factor.js').SecondFactor} collaborators.secondFactor
 */
export function createReauthenticationService(deps, { lock, secondFactor }) {
  const { clock, passwordHasher, accessTokens, logger, emails } = deps;

  /** @param {ServiceContext} context */
  function requireSessionId(context) {
    if (!context.authSessionId) {
      throw new AppError('UNAUTHENTICATED');
    }
    return new mongoose.Types.ObjectId(context.authSessionId);
  }

  return {
    /**
     * Confirme le mot de passe, et le second facteur si la 2FA est active, puis note
     * l'authentification complète sur la session courante. Renvoie un access token dont
     * `auth_time` est à jour : requireRecentAuth l'acceptera. Les échecs comptent pour le
     * verrouillage, comme à la connexion.
     *
     * @param {ServiceContext} context
     * @param {import('@alyora/shared/schemas').ReauthenticateRequest} input
     * @returns {Promise<string>} Le nouvel access token.
     */
    async reauthenticate(context, { password, otp, backupCode }) {
      const userId = requireUserId(context);
      const sessionId = requireSessionId(context);
      const now = clock.now();
      const user = await User.findOne({ _id: userId, deletedAt: null, status: 'active' })
        .select('+passwordHash +twoFactorSecret')
        .lean();
      if (!user || lock.isLocked(user, now)) {
        throw new AppError('INVALID_CREDENTIALS');
      }
      if (!(await passwordHasher.verify(user.passwordHash, password))) {
        await lock.recordFailure(userId, now);
        throw new AppError('INVALID_CREDENTIALS');
      }
      if (user.twoFactorEnabled && !(await secondFactor.verify(user, { otp, backupCode }, now))) {
        await lock.recordFailure(userId, now);
        throw new AppError('INVALID_TWO_FACTOR_CODE');
      }
      const authSession = await AuthSession.findOneAndUpdate(
        { _id: sessionId, userId, revokedAt: null, expiresAt: { $gt: now } },
        { $set: { authenticatedAt: now, lastSeenAt: now } },
        { returnDocument: 'after', projection: { authenticatedAt: 1 } },
      ).lean();
      if (!authSession) {
        throw new AppError('UNAUTHENTICATED');
      }
      await lock.reset(userId);
      logger.info({ event: 'auth.reauthenticated', userId: userId.toString() }, 'Reauthenticated');
      return signSessionAccessToken(accessTokens, user, authSession);
    },

    /**
     * Remplace le mot de passe (sous requireRecentAuth). La session courante reste ouverte,
     * toutes les autres sont révoquées, et le titulaire est prévenu.
     *
     * @param {ServiceContext} context
     * @param {import('@alyora/shared/schemas').ChangePasswordRequest} input
     * @returns {Promise<void>}
     */
    async changePassword(context, { newPassword }) {
      const userId = requireUserId(context);
      const sessionId = requireSessionId(context);
      const user = await User.findOne(
        { _id: userId, deletedAt: null, status: 'active' },
        { email: 1, firstName: 1, lastName: 1, timezone: 1 },
      ).lean();
      if (!user) {
        throw new AppError('UNAUTHENTICATED');
      }
      assertAcceptablePassword(newPassword, user, 'newPassword');
      const passwordHash = await passwordHasher.hash(newPassword);
      const now = clock.now();
      await withTransaction(async (session) => {
        await User.updateOne(
          { _id: userId, deletedAt: null },
          { $set: { passwordHash, passwordChangedAt: now } },
          { session },
        );
        await revokeSessions(session, { userId, _id: { $ne: sessionId } }, 'password_changed', now);
      });
      logger.info(
        { event: 'auth.password_changed', userId: userId.toString() },
        'Password changed: other sessions revoked',
      );
      await sendSafely(
        deps,
        emails.passwordChanged(user, now, { otherDevicesOnly: true }),
        'password_changed',
      );
    },
  };
}
