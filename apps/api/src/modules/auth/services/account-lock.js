import { User } from '../models/user.model.js';
import { sendSafely } from './auth-service-deps.js';

/** Échecs consécutifs qui verrouillent le compte (mot de passe ou second facteur). */
export const LOCK_THRESHOLD = 10;

/** Premier verrouillage : 15 minutes ; chaque suivant dure deux fois plus. */
export const LOCK_BASE_MS = 15 * 60 * 1000;

/** Plafond d'un verrouillage : 24 heures. */
export const LOCK_MAX_MS = 24 * 60 * 60 * 1000;

/** @param {Date} now */
const unlocked = (now) => ({ $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] });

/**
 * Verrouillage temporaire d'un compte après des échecs répétés : mot de passe à la connexion
 * ou à la réauthentification, code du second facteur.
 *
 * Toute vérification d'un secret du compte suit le même ordre :
 * 1. reserveAttempt() réserve un essai AVANT la vérification ;
 * 2. selon le résultat : recordFailure() (l'essai reste compté), releaseAttempt() (secret juste,
 *    mais l'authentification continue) ou reset() (authentification réussie).
 * Ainsi, même sous requêtes simultanées, jamais plus de LOCK_THRESHOLD secrets ne sont vérifiés
 * avant le verrouillage : un essai déjà en cours ne peut pas passer après lui.
 *
 * @param {import('./auth-service-deps.js').AuthServiceDeps} deps
 */
export function createAccountLock(deps) {
  const { logger, emails } = deps;

  return {
    /**
     * Réserve un essai : le compteur est incrémenté par une seule mise à jour atomique, et
     * seulement si le compte n'est pas verrouillé et qu'il lui reste un essai.
     *
     * @param {import('mongoose').Types.ObjectId} userId
     * @param {Date} now
     * @returns {Promise<boolean>} false : compte verrouillé ou essais épuisés, ne rien vérifier.
     */
    async reserveAttempt(userId, now) {
      const reserved = await User.findOneAndUpdate(
        { _id: userId, ...unlocked(now), failedLoginCount: { $lt: LOCK_THRESHOLD } },
        { $inc: { failedLoginCount: 1 } },
        { projection: { _id: 1 } },
      ).lean();
      return reserved !== null;
    },

    /**
     * L'essai réservé a échoué : il reste compté. Au seuil, le verrouillage n'est posé que par
     * la mise à jour qui trouve encore le compte déverrouillé avec le même nombre de
     * verrouillages : de deux échecs simultanés, un seul verrouille (et prévient le titulaire).
     *
     * @param {import('mongoose').Types.ObjectId} userId
     * @param {Date} now
     * @returns {Promise<void>}
     */
    async recordFailure(userId, now) {
      const counted = await User.findOne(
        { _id: userId, ...unlocked(now) },
        { failedLoginCount: 1, lockoutCount: 1 },
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
          ...unlocked(now),
        },
        { $set: { lockedUntil, failedLoginCount: 0 }, $inc: { lockoutCount: 1 } },
        {
          returnDocument: 'after',
          projection: { email: 1, firstName: 1, timezone: 1, locale: 1 },
        },
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
     * Le secret vérifié était juste, mais l'authentification n'est pas finie (le second facteur
     * suit) ou n'en est pas une (activer, désactiver la 2FA) : l'essai réservé est rendu, sans
     * effacer les échecs précédents.
     *
     * @param {import('mongoose').Types.ObjectId} userId
     * @returns {Promise<void>}
     */
    async releaseAttempt(userId) {
      await User.updateOne(
        { _id: userId, failedLoginCount: { $gt: 0 } },
        { $inc: { failedLoginCount: -1 } },
      );
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
