import { withTimeout } from '../async/with-timeout.js';

/** Durée maximale d'une vérification de disponibilité : la sonde doit répondre vite. */
export const READINESS_TIMEOUT_MS = 2_000;

/** @typedef {Record<string, () => Promise<unknown>>} ReadinessChecks */

/**
 * @typedef {object} ReadinessReport
 * @property {boolean} ready
 * @property {Record<string, 'up' | 'down'>} checks Statut seulement : les causes d'échec vont
 *   dans les logs, jamais dans la réponse de la sonde.
 */

/**
 * Lance toutes les vérifications en parallèle, chacune bornée par un délai.
 *
 * @param {ReadinessChecks} checks
 * @param {object} options
 * @param {import('pino').Logger} options.logger
 * @param {number} [options.timeoutMs]
 * @returns {Promise<ReadinessReport>}
 */
export async function checkReadiness(checks, { logger, timeoutMs = READINESS_TIMEOUT_MS }) {
  const entries = Object.entries(checks);
  const results = await Promise.allSettled(
    entries.map(([name, check]) => withTimeout(check, timeoutMs, `${name} check timed out`)),
  );

  /** @type {Record<string, 'up' | 'down'>} */
  const statuses = {};
  results.forEach((result, index) => {
    const [name] = /** @type {[string, unknown]} */ (entries[index]);
    if (result.status === 'fulfilled') {
      statuses[name] = 'up';
      return;
    }
    statuses[name] = 'down';
    logger.warn({ check: name, err: result.reason }, 'Readiness check failed');
  });

  return { ready: results.every((result) => result.status === 'fulfilled'), checks: statuses };
}
