import { AppError } from '../errors/app-error.js';

/** Schéma « Bearer » suivi d'un jeton au format JWT compact (trois segments base64url). */
const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;

/**
 * Identité authentifiée d'une requête, rangée hors de `req` (comme les valeurs validées) et
 * lue par getAuth().
 *
 * @type {WeakMap<object, import('./access-token.js').AccessTokenClaims>}
 */
const authByRequest = new WeakMap();

/**
 * Gardes d'authentification, à placer après les validateurs d'une route (route → validateur
 * Zod → auth → permission → controller).
 *
 * @param {object} deps
 * @param {import('./access-token.js').AccessTokens} deps.accessTokens
 * @param {{ now: () => Date }} deps.clock
 */
export function createAuthGuards({ accessTokens, clock }) {
  return {
    /**
     * Exige une authentification complète (mot de passe, puis 2FA si elle est active) datant
     * de moins de `minutes`, sinon REAUTHENTICATION_REQUIRED : le client fait confirmer le
     * mot de passe (POST /auth/reauthenticate), puis rejoue la requête. À placer après
     * requireAuth, sur les opérations sensibles.
     *
     * @param {number} minutes
     * @returns {import('express').RequestHandler}
     */
    requireRecentAuth(minutes) {
      return (req, _res, next) => {
        const ageSeconds = clock.now().getTime() / 1000 - getAuth(req).authTime;
        if (ageSeconds > minutes * 60) {
          throw new AppError('REAUTHENTICATION_REQUIRED');
        }
        next();
      };
    },

    /**
     * Exige un access token valide. Un compte dont l'adresse n'est pas vérifiée est refusé
     * (EMAIL_NOT_VERIFIED), sauf sur les quelques routes qui lui restent ouvertes
     * (allowUnverified : me, renvoi du lien, déconnexion).
     *
     * @param {{ allowUnverified?: boolean }} [options]
     * @returns {import('express').RequestHandler}
     */
    requireAuth({ allowUnverified = false } = {}) {
      return async (req, res, next) => {
        const match = BEARER.exec(req.get('Authorization') ?? '');
        if (!match?.[1]) {
          res.set('WWW-Authenticate', 'Bearer');
          throw new AppError('UNAUTHENTICATED');
        }
        /** @type {import('./access-token.js').AccessTokenClaims} */
        let claims;
        try {
          claims = await accessTokens.verify(match[1]);
        } catch {
          res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
          throw new AppError('UNAUTHENTICATED');
        }
        if (!claims.emailVerified && !allowUnverified) {
          throw new AppError('EMAIL_NOT_VERIFIED');
        }
        authByRequest.set(req, claims);
        next();
      };
    },
  };
}

/** @typedef {ReturnType<typeof createAuthGuards>} AuthGuards */

/**
 * Identité de la requête, posée par requireAuth.
 *
 * @param {import('express').Request} req
 * @returns {import('./access-token.js').AccessTokenClaims}
 * @throws {Error} Si requireAuth n'a pas tourné : une erreur de programmation.
 */
export function getAuth(req) {
  const claims = authByRequest.get(req);
  if (!claims) {
    throw new Error('getAuth(): requireAuth did not run for this request');
  }
  return claims;
}
