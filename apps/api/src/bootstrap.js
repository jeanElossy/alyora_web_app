import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config/load-config.js';
import { connectMongo, disconnectMongo, pingMongo } from './lib/db/mongo.js';
import { createRedisStore } from './lib/http/rate-limit.js';
import { createLogger } from './lib/logger/create-logger.js';
import { closeGracefully, installProcessHandlers } from './lib/process/lifecycle.js';
import { closeRedis, connectRedis, createRedisClient, pingRedis } from './lib/redis/redis.js';

export const SERVICE_NAME = 'api';

/**
 * Démarre l'API : configuration, logger, MongoDB (replica set obligatoire), Redis, puis HTTP.
 * Tout échec au démarrage est journalisé et termine le processus avec le code 1 : la
 * plateforme le relance (fail fast). Rien n'écoute avant que toutes les dépendances soient
 * prêtes.
 *
 * @param {object} [options] Points d'injection pour les tests.
 * @param {Record<string, string | undefined>} [options.env]
 * @param {import('node:events').EventEmitter} [options.processRef]
 * @param {(code: number) => void} [options.exit]
 * @param {import('pino').DestinationStream} [options.destination]
 * @returns {Promise<import('node:http').Server | undefined>} Le serveur, ou undefined si le
 *   démarrage a échoué.
 */
export async function startServer({
  env = process.env,
  processRef = process,
  exit = (code) => process.exit(code),
  destination,
} = {}) {
  /** @type {ReturnType<typeof loadConfig>} */
  let loaded;
  try {
    loaded = loadConfig(env);
  } catch (error) {
    if (!(error instanceof ConfigError)) {
      throw error;
    }
    createLogger({ level: 'info', service: SERVICE_NAME, destination }).fatal(
      { issues: error.issues },
      'Invalid environment configuration, refusing to start',
    );
    exit(1);
    return undefined;
  }

  const { config, defaultsApplied } = loaded;
  const logger = createLogger({
    level: config.logLevel,
    service: SERVICE_NAME,
    env: config.env,
    destination,
  });
  if (defaultsApplied.length > 0) {
    logger.warn({ variables: defaultsApplied }, 'Non-production defaults applied');
  }

  /** @type {import('./lib/process/lifecycle.js').Resource[]} */
  const resources = [];
  /** @type {import('node:http').Server | undefined} */
  let server;
  installProcessHandlers({
    processRef,
    logger,
    exit,
    shutdown: () => closeGracefully({ server, resources, logger }),
  });

  try {
    const connection = await connectMongo({ ...config.mongo, logger });
    resources.push({ name: 'mongo', close: disconnectMongo });

    const redis = createRedisClient({ url: config.redis.url, logger });
    resources.push({ name: 'redis', close: () => closeRedis(redis) });
    await connectRedis(redis);

    const app = createApp({
      config,
      logger,
      readinessChecks: { mongo: () => pingMongo(connection), redis: () => pingRedis(redis) },
      rateLimitStore: createRedisStore(redis, 'global'),
    });
    server = await listen(app, config.port);
    logger.info({ port: config.port }, 'API listening');
    return server;
  } catch (error) {
    logger.fatal({ err: error }, 'API failed to start');
    await closeGracefully({ server, resources, logger });
    exit(1);
    return undefined;
  }
}

/**
 * @param {import('express').Express} app
 * @param {number} port
 * @returns {Promise<import('node:http').Server>}
 */
function listen(app, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port);
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}
