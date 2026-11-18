import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { AppError } from '../errors/app-error.js';

/**
 * Limite appliquée à toute requête /api/v1, par IP cliente. Volontairement large : les
 * opérateurs mobiles partagent une même IP publique entre beaucoup d'abonnés (CGNAT). Les
 * routes sensibles (connexion, RSVP, contribution, scan) auront leurs propres limites, plus
 * strictes, par compte ou par jeton, dans leurs modules.
 */
export const GLOBAL_RATE_LIMIT = Object.freeze({ windowMs: 15 * 60 * 1000, limit: 1000 });

/**
 * Contrat minimal du client Redis dont le stockage a besoin (`call` d'ioredis).
 *
 * @typedef {{ call: (command: string, ...args: string[]) => Promise<unknown> }} RedisCommandClient
 */

/**
 * Stockage adossé à Redis : les compteurs sont partagés par toutes les instances de l'API, et
 * incrémentés de façon atomique par un script Lua (jamais de lecture puis écriture).
 *
 * @param {RedisCommandClient} redis
 * @param {string} name Nom de la limite, utilisé comme préfixe des clés ("rl:global:<ip>").
 * @returns {import('express-rate-limit').Store}
 */
export function createRedisStore(redis, name) {
  return new RedisStore({
    prefix: `rl:${name}:`,
    sendCommand: async (command, ...args) =>
      /** @type {import('rate-limit-redis').RedisReply} */ (await redis.call(command, ...args)),
  });
}

/**
 * @param {object} options
 * @param {string} options.name Nom de la politique, exposé dans l'en-tête RateLimit-Policy.
 * @param {number} options.windowMs
 * @param {number} options.limit Nombre maximal de requêtes par fenêtre et par clé.
 * @param {import('express-rate-limit').Store} options.store
 * @param {import('pino').Logger} options.logger Reçoit les erreurs du stockage et les
 *   avertissements de mauvaise configuration.
 * @param {boolean} options.failOpen Quand le stockage est injoignable : true laisse passer la
 *   requête (et journalise l'erreur), false répond par une erreur. Les limites sensibles
 *   bloquent.
 * @returns {import('express').RequestHandler}
 */
export function createRateLimiter({ name, windowMs, limit, store, logger, failOpen }) {
  return rateLimit({
    windowMs,
    limit,
    identifier: name,
    store,
    logger,
    passOnStoreError: failOpen,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError('RATE_LIMITED'));
    },
  });
}

/**
 * Limite globale de /api/v1. Laisse passer en cas de panne : perdre Redis ne doit pas faire
 * tomber toute l'API.
 *
 * @param {object} deps
 * @param {import('express-rate-limit').Store} deps.store
 * @param {import('pino').Logger} deps.logger
 */
export function globalRateLimiter({ store, logger }) {
  return createRateLimiter({ name: 'global', ...GLOBAL_RATE_LIMIT, store, logger, failOpen: true });
}
