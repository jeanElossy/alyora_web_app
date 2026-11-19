import { IDEMPOTENCY_KEY_HEADER } from '@alyora/shared';
import { isDuplicateKeyError } from '../db/transaction.js';
import { AppError } from '../errors/app-error.js';
import {
  IDEMPOTENCY_LOCK_MS,
  IDEMPOTENCY_RETENTION_MS,
  IdempotencyKey,
} from './idempotency-key.model.js';

/** Clé choisie par le client : un UUID, ou toute chaîne de 16 à 128 caractères sûrs. */
const KEY_FORMAT = /^[A-Za-z0-9_-]{16,128}$/;

/** Réponses jamais enregistrées : elles disent « réessayez plus tard », pas « voici le résultat ». */
const UNSTORED_STATUSES = new Set([409, 429]);

/**
 * Sérialisation stable (clés triées) : deux corps identiques ont la même empreinte, quel que
 * soit l'ordre de leurs clés.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Idempotence par l'en-tête Idempotency-Key et la collection idempotency_keys :
 * - première requête pour une clé : elle s'exécute, sa réponse est enregistrée ;
 * - même clé, même requête : la réponse enregistrée est rejouée (en-tête Idempotency-Replayed),
 *   sans rien réexécuter ;
 * - même clé, requête différente, ou première requête encore en cours : IDEMPOTENCY_CONFLICT ;
 * - une réponse 5xx n'est pas enregistrée : la clé est libérée pour une nouvelle tentative.
 * La réservation de la clé est atomique (index unique sur scope + key), si bien que deux
 * requêtes simultanées avec la même clé n'en exécutent qu'une.
 *
 * À ne jamais poser sur une route dont la réponse porte un secret (jeton) : elle serait stockée.
 *
 * @param {object} deps
 * @param {import('../crypto/keyed-hash.js').KeyedHasher} deps.keyedHasher
 * @param {{ now: () => Date }} deps.clock
 * @param {import('pino').Logger} deps.logger
 */
export function createIdempotency({ keyedHasher, clock, logger }) {
  /**
   * @param {{ scope: string, key: string, fingerprint: string }} claim
   * @returns {Promise<{ status: number, body: unknown } | null>} La réponse à rejouer, ou null
   *   si la requête doit s'exécuter.
   */
  async function reserve({ scope, key, fingerprint }) {
    const now = clock.now();
    const lockedUntil = new Date(now.getTime() + IDEMPOTENCY_LOCK_MS);
    try {
      await IdempotencyKey.create({
        scope,
        key,
        fingerprint,
        status: 'in_progress',
        lockedUntil,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_RETENTION_MS),
      });
      return null;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
    const existing = await IdempotencyKey.findOne({ scope, key }).lean();
    if (!existing || existing.fingerprint !== fingerprint) {
      throw new AppError('IDEMPOTENCY_CONFLICT');
    }
    if (existing.status === 'completed' && existing.response) {
      return { status: existing.response.status, body: existing.response.body };
    }
    // Encore en cours : reprise seulement si la première tentative a été abandonnée.
    const resumed = await IdempotencyKey.findOneAndUpdate(
      { _id: existing._id, status: 'in_progress', lockedUntil: { $lte: now } },
      { $set: { lockedUntil } },
    );
    if (!resumed) {
      throw new AppError('IDEMPOTENCY_CONFLICT');
    }
    return null;
  }

  /**
   * @param {{ scope: string, key: string }} claim
   * @param {number} status
   * @param {unknown} body
   */
  async function settle({ scope, key }, status, body) {
    const filter = { scope, key, status: /** @type {const} */ ('in_progress') };
    if (status >= 500 || UNSTORED_STATUSES.has(status) || body === undefined) {
      await IdempotencyKey.deleteOne(filter);
      return;
    }
    await IdempotencyKey.updateOne(filter, {
      $set: { status: 'completed', response: { status, body } },
    });
  }

  return {
    /**
     * @param {object} options
     * @param {string} options.scope Portée des clés : la route.
     * @param {(req: import('express').Request) => unknown} options.fingerprint Ce qui définit la
     *   requête (en général le corps validé), sans aucun secret : l'empreinte est stockée.
     * @returns {import('express').RequestHandler}
     */
    idempotent({ scope, fingerprint }) {
      return async (req, res, next) => {
        const key = req.get(IDEMPOTENCY_KEY_HEADER);
        if (!key || !KEY_FORMAT.test(key)) {
          throw new AppError('VALIDATION_ERROR', {
            message: `Missing or invalid ${IDEMPOTENCY_KEY_HEADER} header`,
            details: {
              issues: [
                {
                  path: IDEMPOTENCY_KEY_HEADER,
                  code: key ? 'invalid_format' : 'invalid_type',
                  message: 'Expected 16 to 128 characters among A-Z, a-z, 0-9, _ and -',
                },
              ],
            },
          });
        }
        const claim = {
          scope,
          key,
          fingerprint: keyedHasher.digest('idempotency', canonicalJson(fingerprint(req))),
        };
        const replay = await reserve(claim);
        if (replay) {
          res.set('Idempotency-Replayed', 'true');
          res.status(replay.status).json(replay.body);
          return;
        }
        /** @type {unknown} */
        let body;
        const send = res.json.bind(res);
        res.json = (value) => {
          body = value;
          return send(value);
        };
        res.on('finish', () => {
          settle(claim, res.statusCode, body).catch((/** @type {unknown} */ error) => {
            logger.error({ err: error, scope }, 'Unable to record the idempotent response');
          });
        });
        next();
      };
    },
  };
}

/** @typedef {ReturnType<typeof createIdempotency>} Idempotency */
