import { Redis } from 'ioredis';

/**
 * Une requête HTTP ne doit jamais rester bloquée sur Redis :
 * - commandTimeout : une commande sans réponse échoue après 500 ms (Redis répond en quelques
 *   millisecondes). Sans ce délai, un Redis qui ne répond plus sans fermer la connexion
 *   bloquerait toutes les requêtes soumises au rate limit, et la limite « fail open » ne se
 *   déclencherait jamais ;
 * - maxRetriesPerRequest : une commande échoue après quelques tentatives de reconnexion.
 * (Les connexions BullMQ n'ont besoin ni de l'un ni de l'autre : commandes bloquantes,
 * maxRetriesPerRequest: null. Elles auront leur propre client dans le module des files.)
 */
export const REDIS_OPTIONS = Object.freeze({
  connectTimeout: 10_000,
  commandTimeout: 500,
  maxRetriesPerRequest: 2,
  lazyConnect: true,
});

const MAX_RECONNECT_DELAY_MS = 5_000;

/**
 * Crée le client Redis sans le connecter (voir connectRedis). L'URL n'est jamais journalisée :
 * elle peut contenir un mot de passe.
 *
 * @param {object} options
 * @param {string} options.url
 * @param {import('pino').Logger} options.logger
 * @returns {Redis}
 */
export function createRedisClient({ url, logger }) {
  const client = new Redis(url, {
    ...REDIS_OPTIONS,
    retryStrategy: (attempt) => Math.min(attempt * 200, MAX_RECONNECT_DELAY_MS),
  });
  // Sans écouteur, ioredis écrirait l'erreur dans la console.
  client.on('error', (/** @type {unknown} */ error) => {
    logger.error({ err: error }, 'Redis connection error');
  });
  client.on('ready', () => logger.info('Redis ready'));
  client.on('reconnecting', (/** @type {number} */ delayMs) => {
    logger.warn({ delayMs }, 'Redis reconnecting');
  });
  return client;
}

/**
 * Ouvre la connexion. Échoue si Redis est injoignable, puis arrête les tentatives, pour que le
 * processus puisse s'arrêter (fail fast au démarrage).
 *
 * @param {Redis} client
 * @returns {Promise<void>}
 */
export async function connectRedis(client) {
  try {
    await client.connect();
  } catch (error) {
    client.disconnect();
    throw error;
  }
}

/**
 * Sonde de disponibilité.
 *
 * @param {{ ping: () => Promise<unknown> }} client
 * @returns {Promise<void>}
 */
export async function pingRedis(client) {
  await client.ping();
}

/**
 * Ferme la connexion proprement (QUIT), ou brutalement si Redis ne répond pas.
 *
 * @param {Redis} client
 * @returns {Promise<void>}
 */
export async function closeRedis(client) {
  if (client.status === 'end') {
    return;
  }
  if (client.status !== 'ready') {
    client.disconnect();
    return;
  }
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
