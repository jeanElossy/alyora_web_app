import { pino } from 'pino';
import { getCorrelationId } from '../context/request-context.js';
import { REDACTED, redactLine } from './redact.js';
import { getRequestSecrets } from './request-secrets.js';
import { serializeError } from './serialize-error.js';

/** @typedef {import('pino').Logger} Logger */

/**
 * Chemins exacts d'en-têtes, masqués par le mécanisme natif de pino. Défense en profondeur
 * seulement : le logger HTTP ne journalise pas les en-têtes de requête, et redactLine couvre
 * déjà ces noms.
 */
const HEADER_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
];

/**
 * Crée le logger JSON structuré.
 *
 * Chaque ligne porte l'identifiant de corrélation de la requête ou du job en cours quand il y
 * en a un, et passe par redactLine juste avant d'être écrite : les champs sensibles
 * n'atteignent jamais la sortie, à aucune profondeur, quel que soit le logger, le logger
 * enfant ou le sérialiseur qui les a produits. Pendant une requête, les valeurs sensibles
 * envoyées par son client sont aussi effacées de tout texte de la ligne.
 *
 * @param {object} options
 * @param {string} options.level
 * @param {string} options.service Nom du processus ("api", "worker").
 * @param {string} [options.env]
 * @param {import('pino').DestinationStream} [options.destination] Par défaut la sortie
 *   standard, en écriture synchrone : une ligne fatale est écrite avant la sortie du processus.
 * @returns {Logger}
 */
export function createLogger({ level, service, env, destination }) {
  return pino(
    {
      level,
      base: env ? { service, env } : { service },
      timestamp: pino.stdTimeFunctions.isoTime,
      mixin() {
        const correlationId = getCorrelationId();
        return correlationId ? { correlationId } : {};
      },
      formatters: { level: (label) => ({ level: label }) },
      serializers: { err: serializeError },
      redact: { paths: HEADER_PATHS, censor: REDACTED },
      hooks: { streamWrite: (line) => redactLine(line, getRequestSecrets()) },
    },
    destination,
  );
}
