import { checkReadiness } from '../../lib/health/readiness.js';

/** @typedef {import('express').RequestHandler} RequestHandler */

/** GET /api/v1/ping : le routeur v1 répond. @type {RequestHandler} */
export const ping = (_req, res) => {
  res.json({ status: 'ok' });
};

/** GET /health : le processus est vivant. Ne vérifie rien d'autre, volontairement. @type {RequestHandler} */
export const health = (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ status: 'ok' });
};

/**
 * GET /ready : les dépendances répondent. Un 503 indique à la plateforme de ne plus envoyer de
 * trafic ici.
 *
 * @param {object} deps
 * @param {import('../../lib/health/readiness.js').ReadinessChecks} deps.checks
 * @param {import('pino').Logger} deps.logger
 * @returns {RequestHandler}
 */
export function readiness({ checks, logger }) {
  return async (_req, res) => {
    const report = await checkReadiness(checks, { logger });
    res
      .status(report.ready ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({ status: report.ready ? 'ready' : 'not_ready', checks: report.checks });
  };
}

/**
 * GET /api/v1/docs : le document OpenAPI, construit une seule fois au démarrage.
 *
 * @param {Record<string, unknown>} document
 * @returns {RequestHandler}
 */
export function openApiDocument(document) {
  return (_req, res) => {
    res.json(document);
  };
}
