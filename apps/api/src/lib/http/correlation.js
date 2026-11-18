import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { runWithContext } from '../context/request-context.js';
import { collectRequestSecrets, runWithRequestSecrets } from '../logger/request-secrets.js';
import { serializeError } from '../logger/serialize-error.js';

/** En-tête de requête et de réponse qui porte l'identifiant de corrélation. */
export const CORRELATION_HEADER = 'X-Request-Id';

/**
 * Un identifiant entrant n'est repris que s'il est inoffensif dans une ligne de log : ni
 * espace, ni guillemet, ni caractère de contrôle, longueur bornée. Tout le reste est
 * remplacé, jamais renvoyé.
 */
const SAFE_CORRELATION_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** La plateforme interroge les sondes toutes les quelques secondes : les journaliser serait du bruit. */
const UNLOGGED_PATHS = new Set(['/health', '/ready']);

/**
 * @param {unknown} incoming Valeur de l'en-tête X-Request-Id entrant.
 * @returns {string}
 */
export function resolveCorrelationId(incoming) {
  return typeof incoming === 'string' && SAFE_CORRELATION_ID.test(incoming)
    ? incoming
    : randomUUID();
}

/**
 * Premier middleware : donne à la requête son identifiant de corrélation (`req.id`) et le
 * renvoie au client dans X-Request-Id.
 *
 * @returns {import('express').RequestHandler}
 */
export function assignCorrelationId() {
  return (req, res, next) => {
    const correlationId = resolveCorrelationId(req.get(CORRELATION_HEADER));
    req.id = correlationId;
    res.setHeader(CORRELATION_HEADER, correlationId);
    next();
  };
}

/**
 * Exécute la suite de la chaîne dans le contexte de la requête, pour que les services et le
 * logger lisent l'identifiant de corrélation dans AsyncLocalStorage. Transmet aussi au logger
 * les valeurs sensibles de la requête (voir collectRequestSecrets), pour les effacer de
 * chaque ligne.
 *
 * Monté après la lecture du corps, volontairement : le flux du corps émet ses événements hors
 * du contexte, si bien qu'un contexte ouvert avant serait perdu par les middlewares suivants
 * (et le corps ne serait pas encore connu).
 *
 * @returns {import('express').RequestHandler}
 */
export function bindRequestContext() {
  return (req, _res, next) => {
    const secrets = collectRequestSecrets(req);
    runWithContext({ correlationId: String(req.id) }, () => runWithRequestSecrets(secrets, next));
  };
}

/**
 * Middleware pino-http : une ligne par requête terminée, à un niveau qui suit le statut. La
 * requête est journalisée par sa méthode et son chemin seulement : ni en-têtes, ni query
 * string, ni corps.
 *
 * @param {import('pino').Logger} logger
 */
export function httpLogger(logger) {
  return pinoHttp({
    logger,
    genReqId: (req) => req.id ?? randomUUID(),
    autoLogging: { ignore: (req) => UNLOGGED_PATHS.has(pathOf(req.url)) },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) {
        return 'error';
      }
      return res.statusCode >= 400 ? 'warn' : 'info';
    },
    customSuccessObject: (req, _res, value) => ({ ...value, correlationId: req.id }),
    customErrorObject: (req, _res, _error, value) => ({ ...value, correlationId: req.id }),
    wrapSerializers: false,
    serializers: {
      req: serializeRequest,
      res: (/** @type {import('node:http').ServerResponse} */ res) => ({
        statusCode: res.statusCode,
      }),
      err: serializeError,
    },
  });
}

/**
 * @param {import('node:http').IncomingMessage & { originalUrl?: string }} req
 */
function serializeRequest(req) {
  return { method: req.method, path: pathOf(req.originalUrl ?? req.url) };
}

/**
 * @param {string | undefined} url
 * @returns {string}
 */
function pathOf(url) {
  return (url ?? '').split('?')[0] ?? '';
}
