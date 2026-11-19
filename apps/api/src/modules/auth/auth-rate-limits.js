import { ipKeyGenerator } from 'express-rate-limit';
import { getValidated } from '../../lib/http/validate.js';
import { createRateLimiter } from '../../lib/http/rate-limit.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Limites des routes d'authentification, dans Redis (partagées par toutes les instances).
 * Elles bloquent quand Redis est injoignable (fail closed) : mieux vaut refuser une connexion
 * que laisser deviner des mots de passe sans limite.
 *
 * Les limites par adresse e-mail en utilisent une empreinte à clé : l'adresse n'apparaît
 * jamais dans une clé Redis. Les limites par IP seule sont larges, car les opérateurs mobiles
 * partagent une IP publique entre beaucoup d'abonnés (CGNAT).
 */
export const AUTH_RATE_LIMITS = Object.freeze({
  /** Règle du projet : 5 essais par 15 minutes pour un couple IP + adresse. */
  loginPerAccount: { windowMs: 15 * MINUTE, limit: 5 },
  /** Contre le bourrage d'identifiants (une IP qui essaie beaucoup d'adresses). */
  loginPerIp: { windowMs: 15 * MINUTE, limit: 100 },
  registerPerAccount: { windowMs: HOUR, limit: 5 },
  registerPerIp: { windowMs: HOUR, limit: 30 },
  /** Mot de passe oublié et renvoi du lien : 3 par heure pour un couple IP + adresse. */
  emailPerAccount: { windowMs: HOUR, limit: 3 },
  /** Contre l'inondation d'une boîte depuis plusieurs IP. */
  emailPerAddress: { windowMs: HOUR, limit: 10 },
  emailPerIp: { windowMs: HOUR, limit: 20 },
  /** Jetons reçus par e-mail (vérification, réinitialisation). */
  tokenPerIp: { windowMs: 15 * MINUTE, limit: 20 },
});

/**
 * @param {object} deps
 * @param {(name: string) => import('express-rate-limit').Store} deps.createStore
 * @param {import('../../lib/crypto/keyed-hash.js').KeyedHasher} deps.keyedHasher
 * @param {import('pino').Logger} deps.logger
 */
export function createAuthRateLimits({ createStore, keyedHasher, logger }) {
  /** @param {import('express').Request} req */
  const ip = (req) => ipKeyGenerator(req.ip ?? '');

  /** @param {import('express').Request} req */
  const address = (req) => {
    const body = /** @type {{ email: string }} */ (getValidated(req, 'body'));
    return keyedHasher.digest('rate-limit', body.email);
  };

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
    loginPerIp: limiter('auth-login-ip', AUTH_RATE_LIMITS.loginPerIp),
    loginPerAccount: limiter(
      'auth-login',
      AUTH_RATE_LIMITS.loginPerAccount,
      (req) => `${ip(req)}:${address(req)}`,
    ),
    registerPerIp: limiter('auth-register-ip', AUTH_RATE_LIMITS.registerPerIp),
    registerPerAccount: limiter(
      'auth-register',
      AUTH_RATE_LIMITS.registerPerAccount,
      (req) => `${ip(req)}:${address(req)}`,
    ),
    emailPerIp: limiter('auth-email-ip', AUTH_RATE_LIMITS.emailPerIp),
    emailPerAddress: limiter('auth-email-address', AUTH_RATE_LIMITS.emailPerAddress, address),
    emailPerAccount: limiter(
      'auth-email',
      AUTH_RATE_LIMITS.emailPerAccount,
      (req) => `${ip(req)}:${address(req)}`,
    ),
    tokenPerIp: limiter('auth-token-ip', AUTH_RATE_LIMITS.tokenPerIp),
  };
}

/** @typedef {ReturnType<typeof createAuthRateLimits>} AuthRateLimits */
