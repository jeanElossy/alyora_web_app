import {
  TWO_FACTOR_CHALLENGE_MAX_ATTEMPTS,
  TWO_FACTOR_CHALLENGE_TTL_SECONDS,
} from '@alyora/shared';
import { generateToken, hashToken } from '../../../lib/crypto/random-token.js';
import { AppError } from '../../../lib/errors/app-error.js';
import { TwoFactorChallenge } from '../models/two-factor-challenge.model.js';
import { User } from '../models/user.model.js';

/** @typedef {import('./auth-service-deps.js').AuthServiceDeps} AuthServiceDeps */
/** @typedef {import('./auth-service-deps.js').ServiceContext} ServiceContext */

/**
 * Seconde étape d'une connexion avec 2FA : le mot de passe est vérifié, un code est attendu.
 *
 * @param {AuthServiceDeps} deps
 * @param {object} collaborators
 * @param {import('./session.service.js').SessionService} collaborators.sessions
 * @param {import('./account-lock.js').AccountLock} collaborators.lock
 * @param {import('./second-factor.js').SecondFactor} collaborators.secondFactor
 */
export function createTwoFactorLoginService(deps, { sessions, lock, secondFactor }) {
  const { clock, logger } = deps;

  return {
    /**
     * Ouvre l'étape 2FA : un jeton de 256 bits, valable 5 minutes, dont seule l'empreinte est
     * stockée.
     *
     * @param {import('mongoose').Types.ObjectId} userId
     * @param {Date} now
     * @returns {Promise<string>}
     */
    async createChallenge(userId, now) {
      const token = generateToken();
      await TwoFactorChallenge.create({
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + TWO_FACTOR_CHALLENGE_TTL_SECONDS * 1000),
      });
      return token;
    },

    /**
     * Termine la connexion avec un code TOTP ou un code de secours. Un code faux compte un
     * échec pour l'étape (annulée au cinquième) et pour le compte (verrouillage). L'étape est
     * consommée une seule fois, même sous requêtes simultanées.
     *
     * @param {ServiceContext} context
     * @param {import('@alyora/shared/schemas').TwoFactorVerifyRequest} input
     * @returns {Promise<import('./session-tokens.js').IssuedTokens>}
     * @throws {AppError} INVALID_TOKEN (étape inconnue, expirée, épuisée ou utilisée),
     *   INVALID_TWO_FACTOR_CODE.
     */
    async complete(context, { challengeToken, otp, backupCode }) {
      const now = clock.now();
      const challenge = await TwoFactorChallenge.findOne({
        tokenHash: hashToken(challengeToken),
        consumedAt: null,
        expiresAt: { $gt: now },
        failedAttempts: { $lt: TWO_FACTOR_CHALLENGE_MAX_ATTEMPTS },
      }).lean();
      const user = challenge
        ? await User.findOne({
            _id: challenge.userId,
            deletedAt: null,
            status: 'active',
            twoFactorEnabled: true,
          })
            .select('+twoFactorSecret')
            .lean()
        : null;
      if (!challenge || !user || lock.isLocked(user, now)) {
        throw new AppError('INVALID_TOKEN');
      }
      if (!(await secondFactor.verify(user, { otp, backupCode }, now))) {
        await TwoFactorChallenge.updateOne(
          { _id: challenge._id, consumedAt: null },
          { $inc: { failedAttempts: 1 } },
        );
        await lock.recordFailure(user._id, now);
        logger.info(
          { event: 'auth.second_factor_failed', userId: user._id.toString() },
          'Second factor refused',
        );
        throw new AppError('INVALID_TWO_FACTOR_CODE');
      }
      const consumed = await TwoFactorChallenge.findOneAndUpdate(
        { _id: challenge._id, consumedAt: null },
        { $set: { consumedAt: now } },
      ).lean();
      if (!consumed) {
        throw new AppError('INVALID_TOKEN');
      }
      await lock.reset(user._id);
      const tokens = await sessions.open(context, user);
      logger.info(
        {
          event: 'auth.login_succeeded',
          userId: user._id.toString(),
          secondFactor: backupCode ? 'backup_code' : 'totp',
        },
        'Login',
      );
      return tokens;
    },
  };
}

/** @typedef {ReturnType<typeof createTwoFactorLoginService>} TwoFactorLoginService */
