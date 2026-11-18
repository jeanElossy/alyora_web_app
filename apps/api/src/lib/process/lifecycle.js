import { withTimeout } from '../async/with-timeout.js';

/** Temps laissé aux requêtes en cours et aux ressources sur SIGTERM / SIGINT. */
export const SHUTDOWN_TIMEOUT_MS = 10_000;

/** Budget plus court après une erreur fatale : l'état du processus n'est plus fiable. */
export const FATAL_SHUTDOWN_TIMEOUT_MS = 5_000;

const SIGNALS = /** @type {const} */ (['SIGTERM', 'SIGINT']);

/**
 * @typedef {object} Resource
 * @property {string} name
 * @property {() => Promise<void>} close
 */

/**
 * Cesse d'accepter des connexions, laisse les requêtes en cours se terminer, puis ferme les
 * ressources dans l'ordre. Une ressource qui échoue à se fermer est journalisée et n'empêche
 * pas la fermeture des suivantes.
 *
 * @param {object} options
 * @param {import('node:http').Server} [options.server] Absent quand le démarrage a échoué tôt.
 * @param {ReadonlyArray<Resource>} options.resources
 * @param {import('pino').Logger} options.logger
 * @returns {Promise<void>}
 */
export async function closeGracefully({ server, resources, logger }) {
  if (server?.listening) {
    await closeServer(server);
    logger.info('HTTP server closed');
  }
  for (const resource of resources) {
    try {
      await resource.close();
      logger.info({ resource: resource.name }, 'Resource closed');
    } catch (error) {
      logger.error({ resource: resource.name, err: error }, 'Resource failed to close');
    }
  }
}

/**
 * Branche les événements du processus :
 * - SIGTERM / SIGINT : arrêt propre, puis code de sortie 0 ;
 * - unhandledRejection / uncaughtException : log fatal, arrêt court, puis code de sortie 1.
 * L'arrêt n'est exécuté qu'une fois ; il est borné par un délai, après lequel le processus
 * sort quand même.
 *
 * @param {object} options
 * @param {import('node:events').EventEmitter} options.processRef En général `process`.
 * @param {import('pino').Logger} options.logger
 * @param {() => Promise<void>} options.shutdown
 * @param {(code: number) => void} options.exit
 * @param {number} [options.timeoutMs]
 * @param {number} [options.fatalTimeoutMs]
 * @returns {{ terminate: (reason: string, exitCode: number) => Promise<void> }}
 */
export function installProcessHandlers({
  processRef,
  logger,
  shutdown,
  exit,
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
  fatalTimeoutMs = FATAL_SHUTDOWN_TIMEOUT_MS,
}) {
  /** @type {Promise<void> | undefined} */
  let termination;
  let exitCode = 0;

  /**
   * @param {string} reason
   * @param {number} code
   * @param {number} budgetMs
   * @returns {Promise<void>}
   */
  function terminate(reason, code, budgetMs) {
    // Une erreur fatale pendant un arrêt propre fait quand même sortir le processus avec 1.
    exitCode = Math.max(exitCode, code);
    termination ??= (async () => {
      try {
        await withTimeout(shutdown, budgetMs, `Shutdown exceeded ${budgetMs} ms`);
      } catch (error) {
        logger.error({ err: error, reason }, 'Shutdown did not complete cleanly');
      }
      logger.info({ reason, exitCode }, 'Process exiting');
      exit(exitCode);
    })();
    return termination;
  }

  for (const signal of SIGNALS) {
    processRef.once(signal, () => {
      logger.info({ signal }, 'Shutdown requested');
      void terminate(signal, 0, timeoutMs);
    });
  }
  processRef.on('unhandledRejection', (/** @type {unknown} */ reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection, shutting down');
    void terminate('unhandledRejection', 1, fatalTimeoutMs);
  });
  processRef.on('uncaughtException', (/** @type {unknown} */ error) => {
    logger.fatal({ err: error }, 'Uncaught exception, shutting down');
    void terminate('uncaughtException', 1, fatalTimeoutMs);
  });

  return { terminate: (reason, code) => terminate(reason, code, timeoutMs) };
}

/**
 * @param {import('node:http').Server} server
 * @returns {Promise<void>}
 */
function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    // Sans cela, les connexions keep-alive sans requête en cours retiendraient close().
    server.closeIdleConnections();
  });
}
