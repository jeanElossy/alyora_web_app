import { ACCESS_TOKEN_TTL_SECONDS } from '@alyora/shared';
import { SignJWT, jwtVerify } from 'jose';
import { generateToken } from '../crypto/random-token.js';

/** Émetteur et destinataire attendus : un jeton fait pour un autre service est refusé. */
export const ACCESS_TOKEN_ISSUER = 'alyora-api';
export const ACCESS_TOKEN_AUDIENCE = 'alyora-web';

/** Seul algorithme accepté à la vérification : ni « none », ni un algorithme asymétrique. */
const ALGORITHM = 'HS256';

/** Décalage d'horloge toléré entre instances, en secondes. */
const CLOCK_TOLERANCE_SECONDS = 5;

/**
 * Ce que porte un access token, et rien d'autre (il est lisible par quiconque le détient) :
 *
 * @typedef {object} AccessTokenClaims
 * @property {string} userId `sub`
 * @property {string} sessionId `sid` : la session, révocable côté serveur.
 * @property {boolean} emailVerified `ev` : un compte non vérifié n'accède qu'à quelques routes.
 * @property {number} authTime `auth_time` (secondes) : dernière authentification complète,
 *   pour requireRecentAuth.
 */

/** Levée pour tout jeton refusé, sans dire pourquoi au client. */
export class InvalidAccessTokenError extends Error {
  /** @param {unknown} [cause] */
  constructor(cause) {
    super('Invalid access token', { cause });
    this.name = 'InvalidAccessTokenError';
  }
}

/**
 * Émission et vérification des access tokens : JWT HS256 de 15 minutes, sans état côté
 * serveur. Une session révoquée ne peut plus rafraîchir, mais son dernier access token reste
 * valable jusqu'à son expiration, au plus 15 minutes : c'est accepté et documenté (ADR 0004).
 *
 * @param {object} options
 * @param {string} options.secret ACCESS_TOKEN_SECRET.
 * @param {{ now: () => Date }} options.clock
 */
export function createAccessTokens({ secret, clock }) {
  const key = new TextEncoder().encode(secret);

  return {
    /**
     * @param {AccessTokenClaims} claims
     * @returns {Promise<string>}
     */
    async sign({ userId, sessionId, emailVerified, authTime }) {
      const issuedAt = Math.floor(clock.now().getTime() / 1000);
      return new SignJWT({ sid: sessionId, ev: emailVerified, auth_time: authTime })
        .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
        .setSubject(userId)
        .setIssuer(ACCESS_TOKEN_ISSUER)
        .setAudience(ACCESS_TOKEN_AUDIENCE)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
        .setJti(generateToken(16))
        .sign(key);
    },

    /**
     * @param {string} token
     * @returns {Promise<AccessTokenClaims>}
     * @throws {InvalidAccessTokenError}
     */
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: [ALGORITHM],
          issuer: ACCESS_TOKEN_ISSUER,
          audience: ACCESS_TOKEN_AUDIENCE,
          clockTolerance: CLOCK_TOLERANCE_SECONDS,
          currentDate: clock.now(),
          requiredClaims: ['sub', 'sid', 'exp', 'iat'],
        });
        if (
          typeof payload.sub !== 'string' ||
          typeof payload.sid !== 'string' ||
          typeof payload.ev !== 'boolean' ||
          typeof payload.auth_time !== 'number'
        ) {
          throw new TypeError('Unexpected access token claims');
        }
        return {
          userId: payload.sub,
          sessionId: payload.sid,
          emailVerified: payload.ev,
          authTime: payload.auth_time,
        };
      } catch (error) {
        throw new InvalidAccessTokenError(error);
      }
    },
  };
}

/** @typedef {ReturnType<typeof createAccessTokens>} AccessTokens */
