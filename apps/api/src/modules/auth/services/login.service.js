import { AppError } from '../../../lib/errors/app-error.js';
import { User } from '../models/user.model.js';

export { LOCK_BASE_MS, LOCK_MAX_MS, LOCK_THRESHOLD } from './account-lock.js';

/** @typedef {import('./auth-service-deps.js').AuthServiceDeps} AuthServiceDeps */
/** @typedef {import('./auth-service-deps.js').ServiceContext} ServiceContext */

/**
 * Issue d'une connexion : une session ouverte, ou, si la 2FA est active, l'étape du code.
 *
 * @typedef {import('./session-tokens.js').IssuedTokens | { challengeToken: string }} LoginResult
 */

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
 * @param {object} collaborators
 * @param {import('./session.service.js').SessionService} collaborators.sessions
 * @param {import('./account-lock.js').AccountLock} collaborators.lock
 * @param {import('./two-factor-login.service.js').TwoFactorLoginService} collaborators.twoFactorLogin
 */
export function createLoginService(deps, { sessions, lock, twoFactorLogin }) {
  const { clock, passwordHasher, logger } = deps;

  return {
    /**
     * @param {ServiceContext} context
     * @param {import('@alyora/shared/schemas').LoginRequest} input
     * @returns {Promise<LoginResult>}
     * @throws {AppError} INVALID_CREDENTIALS
     */
    async login(context, { email, password }) {
      const now = clock.now();
      const user = await User.findOne({ email, deletedAt: null }).select('+passwordHash').lean();
      if (!user) {
        await passwordHasher.verifyDummy(password);
        throw invalidCredentials();
      }
      // Essai réservé avant la vérification : compte verrouillé, désactivé ou essais épuisés,
      // le mot de passe n'est pas vérifié, mais la durée et la réponse restent les mêmes.
      if (user.status !== 'active' || !(await lock.reserveAttempt(user._id, now))) {
        await passwordHasher.verifyDummy(password);
        logger.info(
          { event: 'auth.login_refused', userId: user._id.toString() },
          'Login refused: account locked or disabled',
        );
        throw invalidCredentials();
      }
      if (!(await passwordHasher.verify(user.passwordHash, password))) {
        await lock.recordFailure(user._id, now);
        logger.info({ event: 'auth.login_failed', userId: user._id.toString() }, 'Login failed');
        throw invalidCredentials();
      }
      /** @type {Record<string, unknown>} */
      const rehash = passwordHasher.needsRehash(user.passwordHash)
        ? { passwordHash: await passwordHasher.hash(password) }
        : {};
      if (user.twoFactorEnabled) {
        // Mot de passe juste : l'essai est rendu, mais les échecs précédents restent comptés
        // jusqu'au second facteur. Connaître le mot de passe ne permet pas d'essayer des codes
        // sans fin.
        await lock.releaseAttempt(user._id);
        if (Object.keys(rehash).length > 0) {
          await User.updateOne({ _id: user._id }, { $set: rehash });
        }
        const challengeToken = await twoFactorLogin.createChallenge(user._id, now);
        logger.info(
          { event: 'auth.login_second_factor_required', userId: user._id.toString() },
          'Password accepted: second factor required',
        );
        return { challengeToken };
      }
      await lock.reset(user._id, rehash);
      const tokens = await sessions.open(context, user);
      logger.info({ event: 'auth.login_succeeded', userId: user._id.toString() }, 'Login');
      return tokens;
    },
  };
}
