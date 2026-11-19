import { User } from '../models/user.model.js';
import { sendSafely } from './auth-service-deps.js';

/** Échecs consécutifs qui verrouillent le compte (mot de passe ou second facteur). */
export const LOCK_THRESHOLD = 10;

/** Premier verrouillage : 15 minutes ; chaque suivant dure deux fois plus. */
export const LOCK_BASE_MS = 15 * 60 * 1000;

/** Plafond d'un verrouillage : 24 heures. */
export const LOCK_MAX_MS = 24 * 60 * 60 * 1000;

/**
 * Verrouillage temporaire d'un compte après des échecs répétés : mot de passe à la connexion
 * ou à la réauthentification, code du second facteur.
 *
 * @param {import('./auth-service-deps.js').AuthServiceDeps} deps
 */
export function createAccountLock(deps) {
  const { logger, emails } = deps;

  return {
    /**
     * @param {{ lockedUntil?: Date | null }} user
     * @param {Date} now
     * @returns {boolean}
     */
    isLocked(user, now) {
      return Boolean(user.lockedUntil && user.lockedUntil > now);
    },

    /**
     * Compte un échec, et verrouille le compte au dixième échec consécutif. Deux mises à jour
     * atomiques et conditionnelles, jamais une lecture suivie d'une écriture :
     * 1. l'échec est compté ($inc), sauf pendant un verrouillage (un attaquant qui insiste ne
     *    prépare pas le verrouillage suivant) ;
     * 2. au seuil, le verrouillage n'est posé que par la mise à jour qui trouve encore le compte
     *    déverrouillé au seuil : de deux échecs simultanés, un seul verrouille (et prévient).
     *
     * @param {import('mongoose').Types.ObjectId} userId
     * @param {Date} now
     * @returns {Promise<void>}
     */
    async recordFailure(userId, now) {
      const unlocked = { $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] };
      const counted = await User.findOneAndUpdate(
        { _id: userId, ...unlocked },
        { $inc: { failedLoginCount: 1 } },
        { returnDocument: 'after', projection: { failedLoginCount: 1, lockoutCount: 1 } },
      ).lean();
      if (!counted || counted.failedLoginCount < LOCK_THRESHOLD) {
        return;
      }
      const lockedUntil = new Date(
        now.getTime() + Math.min(LOCK_BASE_MS * 2 ** counted.lockoutCount, LOCK_MAX_MS),
      );
      const locked = await User.findOneAndUpdate(
        {
          _id: userId,
          lockoutCount: counted.lockoutCount,
          failedLoginCount: { $gte: LOCK_THRESHOLD },
          ...unlocked,
        },
        { $set: { lockedUntil, failedLoginCount: 0 }, $inc: { lockoutCount: 1 } },
        { returnDocument: 'after', projection: { email: 1, firstName: 1, timezone: 1 } },
      ).lean();
      if (locked) {
        logger.warn(
          { event: 'auth.account_locked', userId: userId.toString(), lockedUntil },
          'Account locked after repeated login failures',
        );
        await sendSafely(deps, emails.accountLocked(locked, lockedUntil), 'account_locked');
      }
    },

    /**
     * Après une authentification complète réussie : compteurs remis à zéro.
     *
     * @param {import('mongoose').Types.ObjectId} userId
     * @param {Record<string, unknown>} [extra] Autres champs à poser en même temps.
     * @returns {Promise<void>}
     */
    async reset(userId, extra = {}) {
      await User.updateOne(
        { _id: userId },
        { $set: { failedLoginCount: 0, lockedUntil: null, lockoutCount: 0, ...extra } },
      );
    },
  };
}

/** @typedef {ReturnType<typeof createAccountLock>} AccountLock */
