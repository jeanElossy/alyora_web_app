import { MAX_ACTIVE_SESSIONS } from '@alyora/shared';
import mongoose from 'mongoose';
import { generateToken, hashToken } from '../../../lib/crypto/random-token.js';
import { withTransaction } from '../../../lib/db/transaction.js';
import { AppError } from '../../../lib/errors/app-error.js';
import { describeDevice, truncateUserAgent } from '../device-label.js';
import { AuthSession } from '../models/auth-session.model.js';
import { RefreshToken } from '../models/refresh-token.model.js';
import {
  refreshExpiry,
  requireUserId,
  revokeSessions,
  signSessionAccessToken,
} from './session-tokens.js';

/** @typedef {import('./auth-service-deps.js').AuthServiceDeps} AuthServiceDeps */
/** @typedef {import('./auth-service-deps.js').ServiceContext} ServiceContext */
/** @typedef {import('./session-tokens.js').IssuedTokens} IssuedTokens */

/**
 * Sessions d'authentification : ouverture, révocation, liste. La rotation du refresh token
 * est dans refresh.service.js.
 *
 * @param {AuthServiceDeps} deps
 */
export function createSessionService({ clock, accessTokens, keyedHasher }) {
  return {
    /**
     * Ouvre une session après une authentification complète. Au-delà de MAX_ACTIVE_SESSIONS
     * sessions actives, les moins récemment utilisées sont révoquées (limite douce : deux
     * connexions simultanées peuvent la dépasser d'une session, la suivante la rétablit).
     *
     * @param {ServiceContext} context
     * @param {{ _id: mongoose.Types.ObjectId, emailVerifiedAt?: Date | null }} user
     * @returns {Promise<IssuedTokens>}
     */
    async open(context, user) {
      const now = clock.now();
      const { authSession, refreshToken } = await withTransaction(async (session) => {
        const active = await AuthSession.find(
          { userId: user._id, revokedAt: null, expiresAt: { $gt: now } },
          { _id: 1 },
          { session },
        )
          .sort({ lastSeenAt: -1 })
          .limit(MAX_ACTIVE_SESSIONS + 5)
          .lean();
        const surplus = active.slice(MAX_ACTIVE_SESSIONS - 1).map(({ _id }) => _id);
        if (surplus.length > 0) {
          await revokeSessions(
            session,
            { userId: user._id, _id: { $in: surplus } },
            'session_limit',
            now,
          );
        }
        const expiresAt = refreshExpiry(now);
        const [created] = await AuthSession.create(
          [
            {
              userId: user._id,
              deviceLabel: describeDevice(context.client.userAgent),
              userAgent: truncateUserAgent(context.client.userAgent),
              ipHash: keyedHasher.digest('ip', context.client.ip),
              lastSeenAt: now,
              authenticatedAt: now,
              expiresAt,
            },
          ],
          { session },
        );
        const token = generateToken();
        await RefreshToken.create(
          [
            {
              sessionId: created._id,
              userId: user._id,
              familyId: created._id,
              tokenHash: hashToken(token),
              expiresAt,
            },
          ],
          { session },
        );
        return { authSession: created, refreshToken: token };
      });
      return {
        accessToken: await signSessionAccessToken(accessTokens, user, authSession),
        refreshToken,
      };
    },

    /**
     * Révoque une session du compte appelant. Une session d'un autre compte est introuvable
     * (NOT_FOUND), exactement comme une session inexistante.
     *
     * @param {ServiceContext} context
     * @param {string} sessionId
     * @param {string} [reason]
     * @returns {Promise<void>}
     */
    async revoke(context, sessionId, reason = 'revoked') {
      const userId = requireUserId(context);
      const now = clock.now();
      const count = await withTransaction((session) =>
        revokeSessions(
          session,
          { userId, _id: new mongoose.Types.ObjectId(sessionId) },
          reason,
          now,
        ),
      );
      if (count === 0) {
        throw new AppError('NOT_FOUND', { message: 'Session not found' });
      }
    },

    /**
     * Déconnexion de l'appareil courant. Sans effet si la session est déjà révoquée.
     *
     * @param {ServiceContext} context
     * @returns {Promise<void>}
     */
    async logout(context) {
      const userId = requireUserId(context);
      const { authSessionId } = context;
      if (!authSessionId) {
        return;
      }
      const now = clock.now();
      await withTransaction((session) =>
        revokeSessions(
          session,
          { userId, _id: new mongoose.Types.ObjectId(authSessionId) },
          'logout',
          now,
        ),
      );
    },

    /**
     * Déconnexion de tous les appareils du compte, l'appareil courant compris.
     *
     * @param {ServiceContext} context
     * @param {string} [reason]
     * @returns {Promise<number>}
     */
    async revokeAll(context, reason = 'logout_all') {
      const userId = requireUserId(context);
      const now = clock.now();
      return withTransaction((session) => revokeSessions(session, { userId }, reason, now));
    },

    /**
     * Sessions actives du compte, la plus récemment utilisée d'abord. Bornée à
     * MAX_ACTIVE_SESSIONS (voir open).
     *
     * @param {ServiceContext} context
     * @returns {Promise<import('@alyora/shared/schemas').AuthSession[]>}
     */
    async list(context) {
      const userId = requireUserId(context);
      const sessions = await AuthSession.find(
        { userId, revokedAt: null, expiresAt: { $gt: clock.now() } },
        { deviceLabel: 1, createdAt: 1, lastSeenAt: 1 },
      )
        .sort({ lastSeenAt: -1 })
        .limit(MAX_ACTIVE_SESSIONS)
        .lean();
      return sessions.map((item) => ({
        id: item._id.toString(),
        deviceLabel: item.deviceLabel,
        createdAt: /** @type {Date} */ (item.createdAt).toISOString(),
        lastSeenAt: item.lastSeenAt.toISOString(),
        current: item._id.toString() === context.authSessionId,
      }));
    },
  };
}

/** @typedef {ReturnType<typeof createSessionService>} SessionService */
