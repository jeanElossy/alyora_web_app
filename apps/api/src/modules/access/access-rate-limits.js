import { getAuth } from '../../lib/auth/require-auth.js';
import { createRateLimiter } from '../../lib/http/rate-limit.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Limites des routes de collaboration, dans Redis. Elles bloquent quand Redis est injoignable
 * (fail closed) : une invitation envoie un e-mail, et une acceptation présente un jeton.
 */
export const ACCESS_RATE_LIMITS = Object.freeze({
  /** Invitations créées par un compte : chacune envoie un e-mail. */
  invitationsPerAccount: { windowMs: HOUR, limit: 50 },
  /** Acceptations (jetons présentés) par IP, large à cause du CGNAT des opérateurs mobiles. */
  acceptPerIp: { windowMs: 15 * MINUTE, limit: 20 },
  /** Acceptations par compte. */
  acceptPerAccount: { windowMs: 15 * MINUTE, limit: 10 },
});

/**
 * @param {object} deps
 * @param {(name: string) => import('express-rate-limit').Store} deps.createStore
 * @param {import('../../lib/crypto/keyed-hash.js').KeyedHasher} deps.keyedHasher
 * @param {import('pino').Logger} deps.logger
 */
export function createAccessRateLimits({ createStore, keyedHasher, logger }) {
  /** Après requireAuth : la clé est le compte, en empreinte (jamais l'identifiant en clair). */
  const account = (/** @type {import('express').Request} */ req) =>
    keyedHasher.digest('rate-limit', `user:${getAuth(req).userId}`);

  /**
   * @param {string} name
   * @param {{ windowMs: number, limit: number }} rule
   * @param {(req: import('express').Request) => string} [keyGenerator]
   */
  const limiter = (name, rule, keyGenerator) =>
    createRateLimiter({
      name,
      ...rule,
      store: createStore(name),
      logger,
      failOpen: false,
      keyGenerator,
    });

  return {
    invitationsPerAccount: limiter(
      'access-invitations',
      ACCESS_RATE_LIMITS.invitationsPerAccount,
      account,
    ),
    // Sans clé : l'IP du client, comme les limites par IP de l'authentification.
    acceptPerIp: limiter('access-accept-ip', ACCESS_RATE_LIMITS.acceptPerIp),
    acceptPerAccount: limiter('access-accept', ACCESS_RATE_LIMITS.acceptPerAccount, account),
  };
}

/** @typedef {ReturnType<typeof createAccessRateLimits>} AccessRateLimits */
