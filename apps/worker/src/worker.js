import path from 'node:path';
import {
  MAIL_QUEUE_NAME,
  createFileTransport,
  createLogger,
  createMailProcessor,
  createSecretBox,
} from '@alyora/api';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { WorkerConfigError, loadWorkerConfig } from './config.js';

export const SERVICE_NAME = 'worker';

/** Signaux d'arrêt : le worker termine les jobs en cours, puis ferme Redis. */
const SIGNALS = /** @type {const} */ (['SIGTERM', 'SIGINT']);

/**
 * Démarre le worker : la file des e-mails (déchiffrement, envoi). Tout échec au démarrage
 * est journalisé et termine le processus avec le code 1.
 *
 * @param {object} [options] Points d'injection pour les tests.
 * @param {Record<string, string | undefined>} [options.env]
 * @param {import('node:events').EventEmitter} [options.processRef]
 * @param {(code: number) => void} [options.exit]
 * @param {import('pino').DestinationStream} [options.destination]
 * @returns {Promise<{ close: () => Promise<void> } | undefined>}
 */
export async function startWorker({
  env = process.env,
  processRef = process,
  exit = (code) => process.exit(code),
  destination,
} = {}) {
  /** @type {ReturnType<typeof loadWorkerConfig>} */
  let loaded;
  try {
    loaded = loadWorkerConfig(env);
  } catch (error) {
    if (!(error instanceof WorkerConfigError)) {
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

  // Connexion propre au worker : commandes bloquantes de BullMQ, donc sans limite de
  // tentatives par commande (maxRetriesPerRequest: null).
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  connection.on('error', (/** @type {unknown} */ error) => {
    logger.error({ err: error }, 'Redis connection error');
  });

  const worker = new Worker(
    MAIL_QUEUE_NAME,
    createMailProcessor({
      secretBox: createSecretBox(config.dataEncryptionKey),
      transport: createFileTransport({ directory: path.resolve(config.email.outboxDir) }),
      logger,
    }),
    { connection, concurrency: config.concurrency },
  );
  // Ni destinataire ni contenu dans les logs : le nom et le code de l'erreur seulement.
  worker.on('failed', (job, error) => {
    logger.warn(
      {
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        error: { name: error.name, code: /** @type {{ code?: unknown }} */ (error).code },
      },
      'Email job failed',
    );
  });
  worker.on('error', (error) => {
    logger.error({ error: { name: error.name } }, 'Worker error');
  });

  let closing = false;
  const close = async () => {
    if (closing) {
      return;
    }
    closing = true;
    await worker.close();
    await connection.quit().catch(() => connection.disconnect());
    logger.info('Worker stopped');
  };
  for (const signal of SIGNALS) {
    processRef.once(signal, () => {
      close().then(
        () => exit(0),
        (/** @type {unknown} */ error) => {
          logger.error({ err: error }, 'Worker failed to stop cleanly');
          exit(1);
        },
      );
    });
  }

  await worker.waitUntilReady();
  logger.info({ queue: MAIL_QUEUE_NAME, concurrency: config.concurrency }, 'Worker ready');
  return { close };
}
