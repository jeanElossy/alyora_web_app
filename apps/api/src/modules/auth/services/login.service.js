import { AppError } from '../../../lib/errors/app-error.js';
import { User } from '../models/user.model.js';
import { sendSafely } from './auth-service-deps.js';

/** Échecs consécutifs qui verrouillent le compte. */
export const LOCK_THRESHOLD = 10;

/** Premier verrouillage : 15 minutes ; chaque suivant dure deux fois plus. */
export const LOCK_BASE_MS = 15 * 60 * 1000;

/** Plafond d'un verrouillage : 24 heures. */
export const LOCK_MAX_MS = 24 * 60 * 60 * 1000;

/** @typedef {import('./auth-service-deps.js').AuthServiceDeps} AuthServiceDeps */
/** @typedef {import('./auth-service-deps.js').ServiceContext} ServiceContext */

/** La seule erreur de connexion, quelle que soit la cause. */
const invalidCredentials = () => new AppError('INVALID_CREDENTIALS');

/**
 * Connexion par e-mail et mot de passe.
 *
 * Réponse uniforme : « identifiants invalides », même code, même corps, même durée, que
 * l'adresse corresponde à un compte ou non, que le compte soit verrouillé ou désactivé. Pour
 * un compte absent, le mot de passe est vérifié contre un hash factice, qui prend le même
 * temps. La limite de 5 essais par 15 minutes (IP + adresse) rend en outre toute mesure fine
 * des durées impraticable.
 *
 * @param {AuthServiceDeps} deps
 * @param {import('./session.service.js').SessionService} sessions
 */
export function createLoginService(deps, sessions) {
  const { clock, passwordHasher, logger, emails } = deps;

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
   */
  async function recordFailure(userId, now) {
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
  }

  return {
    /**
     * @param {ServiceContext} context
     * @param {import('@alyora/shared/schemas').LoginRequest} input
     * @returns {Promise<import('./session-tokens.js').IssuedTokens>}
     * @throws {AppError} INVALID_CREDENTIALS
     */
    async login(context, { email, password }) {
      const now = clock.now();
      const user = await User.findOne({ email, deletedAt: null }).select('+passwordHash').lean();
      if (!user) {
        await passwordHasher.verifyDummy(password);
        throw invalidCredentials();
      }
      const passwordMatches = await passwordHasher.verify(user.passwordHash, password);
      if (!passwordMatches) {
        await recordFailure(user._id, now);
        logger.info({ event: 'auth.login_failed', userId: user._id.toString() }, 'Login failed');
        throw invalidCredentials();
      }
      const locked = Boolean(user.lockedUntil && user.lockedUntil > now);
      if (locked || user.status !== 'active') {
        logger.info(
          { event: 'auth.login_refused', userId: user._id.toString(), locked },
          'Login refused: account locked or disabled',
        );
        throw invalidCredentials();
      }
      /** @type {Record<string, unknown>} */
      const reset = { failedLoginCount: 0, lockedUntil: null, lockoutCount: 0 };
      if (passwordHasher.needsRehash(user.passwordHash)) {
        reset.passwordHash = await passwordHasher.hash(password);
      }
      await User.updateOne({ _id: user._id }, { $set: reset });
      const tokens = await sessions.open(context, user);
      logger.info({ event: 'auth.login_succeeded', userId: user._id.toString() }, 'Login');
      return tokens;
    },
  };
}
