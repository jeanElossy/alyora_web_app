import { MAX_ACTIVE_SESSIONS, REFRESH_TOKEN_TTL_SECONDS } from '@alyora/shared';
import mongoose from 'mongoose';
import { AppError } from '../../../lib/errors/app-error.js';
import { AuthSession } from '../models/auth-session.model.js';
import { RefreshToken } from '../models/refresh-token.model.js';
import { toEpochSeconds } from './auth-service-deps.js';

// Utilitaires communs aux services de session (ouverture, rotation, révocation).

/**
 * Jetons remis au client à l'ouverture ou au renouvellement d'une session.
 *
 * @typedef {object} IssuedTokens
 * @property {string} accessToken Dans le corps de la réponse.
 * @property {string} refreshToken Dans le cookie HttpOnly, jamais dans le corps.
 */

/**
 * Fin de validité d'un refresh token émis maintenant : 30 jours.
 *
 * @param {Date} now
 * @returns {Date}
 */
export const refreshExpiry = (now) => new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);

/**
 * Access token d'une session.
 *
 * @param {import('../../../lib/auth/access-token.js').AccessTokens} accessTokens
 * @param {{ _id: mongoose.Types.ObjectId, emailVerifiedAt?: Date | null }} user
 * @param {{ _id: mongoose.Types.ObjectId, authenticatedAt: Date }} authSession
 * @returns {Promise<string>}
 */
export function signSessionAccessToken(accessTokens, user, authSession) {
  return accessTokens.sign({
    userId: user._id.toString(),
    sessionId: authSession._id.toString(),
    emailVerified: Boolean(user.emailVerifiedAt),
    authTime: toEpochSeconds(authSession.authenticatedAt),
  });
}

/**
 * Révoque des sessions encore valides et tous leurs refresh tokens, dans la session
 * transactionnelle donnée. Une session expirée est déjà inutilisable : elle n'est pas comptée.
 * Les sessions valides d'un compte sont au plus MAX_ACTIVE_SESSIONS (voir open) ; la lecture
 * est bornée par sécurité.
 *
 * @param {mongoose.ClientSession} session
 * @param {Record<string, unknown>} filter Toujours borné à un compte (userId).
 * @param {string} reason
 * @param {Date} now
 * @returns {Promise<number>} Nombre de sessions révoquées.
 */
export async function revokeSessions(session, filter, reason, now) {
  const targets = await AuthSession.find(
    { ...filter, revokedAt: null, expiresAt: { $gt: now } },
    { _id: 1 },
    { session },
  )
    .sort({ lastSeenAt: -1 })
    .limit(MAX_ACTIVE_SESSIONS * 2)
    .lean();
  if (targets.length === 0) {
    return 0;
  }
  const ids = targets.map(({ _id }) => _id);
  await AuthSession.updateMany(
    { _id: { $in: ids }, revokedAt: null },
    { $set: { revokedAt: now, revokedReason: reason } },
    { session },
  );
  await RefreshToken.updateMany(
    { sessionId: { $in: ids }, revokedAt: null },
    { $set: { revokedAt: now } },
    { session },
  );
  return ids.length;
}

/**
 * Compte du contexte, obligatoire.
 *
 * @param {import('./auth-service-deps.js').ServiceContext} context
 * @returns {mongoose.Types.ObjectId}
 * @throws {AppError} UNAUTHENTICATED pour un contexte anonyme.
 */
export function requireUserId(context) {
  if (!context.userId) {
    throw new AppError('UNAUTHENTICATED');
  }
  return new mongoose.Types.ObjectId(context.userId);
}
