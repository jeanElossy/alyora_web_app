import { generateToken, hashToken } from '../../../lib/crypto/random-token.js';
import { withTransaction } from '../../../lib/db/transaction.js';
import { AppError } from '../../../lib/errors/app-error.js';
import { AuthSession } from '../models/auth-session.model.js';
import { RefreshToken } from '../models/refresh-token.model.js';
import { User } from '../models/user.model.js';
import { sendSafely } from './auth-service-deps.js';
import { refreshExpiry, signSessionAccessToken } from './session-tokens.js';

/** @typedef {import('./auth-service-deps.js').AuthServiceDeps} AuthServiceDeps */
/** @typedef {import('./auth-service-deps.js').ServiceContext} ServiceContext */
/** @typedef {import('./session-tokens.js').IssuedTokens} IssuedTokens */

/**
 * Renouvellement de session par rotation du refresh token, avec détection de réutilisation.
 *
 * @param {AuthServiceDeps} deps
 */
export function createRefreshService(deps) {
  const { clock, accessTokens, logger, emails } = deps;

  return {
    /**
     * Rotation : consomme le refresh token présenté et en émet un nouveau, dans la même
     * transaction. La consommation est conditionnelle (usedAt: null), donc atomique : de deux
     * requêtes simultanées avec le même jeton, une seule le consomme.
     *
     * Un jeton déjà consommé est un vol présumé : toute la famille (la session et tous ses
     * jetons) est révoquée, l'incident est journalisé, le titulaire est prévenu, et le client
     * doit se reconnecter.
     *
     * @param {ServiceContext} _context
     * @param {string} presentedToken
     * @returns {Promise<IssuedTokens>}
     * @throws {AppError} UNAUTHENTICATED pour tout jeton refusé.
     */
    async rotate(_context, presentedToken) {
      const tokenHash = hashToken(presentedToken);
      const now = clock.now();
      const outcome = await withTransaction(async (session) => {
        const consumed = await RefreshToken.findOneAndUpdate(
          { tokenHash, usedAt: null, revokedAt: null, expiresAt: { $gt: now } },
          { $set: { usedAt: now } },
          { session, returnDocument: 'after' },
        ).lean();
        if (!consumed) {
          const known = await RefreshToken.findOne({ tokenHash }, null, { session }).lean();
          if (!known?.usedAt) {
            return /** @type {const} */ ({ kind: 'refused' });
          }
          await RefreshToken.updateMany(
            { familyId: known.familyId, revokedAt: null },
            { $set: { revokedAt: now } },
            { session },
          );
          const revoked = await AuthSession.updateOne(
            { _id: known.sessionId, userId: known.userId, revokedAt: null },
            { $set: { revokedAt: now, revokedReason: 'refresh_reuse' } },
            { session },
          );
          return /** @type {const} */ ({
            kind: 'reuse',
            userId: known.userId,
            sessionId: known.sessionId,
            familyId: known.familyId,
            firstDetection: revoked.modifiedCount > 0,
          });
        }
        const authSession = await AuthSession.findOne(
          {
            _id: consumed.sessionId,
            userId: consumed.userId,
            revokedAt: null,
            expiresAt: { $gt: now },
          },
          null,
          { session },
        ).lean();
        const user = await User.findOne(
          { _id: consumed.userId, status: 'active', deletedAt: null },
          { emailVerifiedAt: 1 },
          { session },
        ).lean();
        if (!authSession || !user) {
          return /** @type {const} */ ({ kind: 'refused' });
        }
        const token = generateToken();
        const expiresAt = refreshExpiry(now);
        const [successor] = await RefreshToken.create(
          [
            {
              sessionId: consumed.sessionId,
              userId: consumed.userId,
              familyId: consumed.familyId,
              tokenHash: hashToken(token),
              expiresAt,
            },
          ],
          { session },
        );
        await RefreshToken.updateOne(
          { _id: consumed._id },
          { $set: { replacedBy: successor._id } },
          { session },
        );
        await AuthSession.updateOne(
          { _id: authSession._id, userId: consumed.userId },
          { $set: { lastSeenAt: now, expiresAt } },
          { session },
        );
        return /** @type {const} */ ({ kind: 'rotated', user, authSession, refreshToken: token });
      });

      if (outcome.kind === 'reuse') {
        logger.warn(
          {
            event: 'auth.refresh_token_reuse',
            userId: outcome.userId.toString(),
            sessionId: outcome.sessionId.toString(),
            familyId: outcome.familyId.toString(),
          },
          'Refresh token reuse detected: token family revoked',
        );
        if (outcome.firstDetection) {
          const owner = await User.findOne(
            { _id: outcome.userId, deletedAt: null },
            { email: 1, firstName: 1, timezone: 1 },
          ).lean();
          if (owner) {
            await sendSafely(deps, emails.suspiciousSession(owner), 'suspicious_session');
          }
        }
        throw new AppError('UNAUTHENTICATED');
      }
      if (outcome.kind === 'refused') {
        throw new AppError('UNAUTHENTICATED');
      }
      return {
        accessToken: await signSessionAccessToken(accessTokens, outcome.user, outcome.authSession),
        refreshToken: outcome.refreshToken,
      };
    },
  };
}
