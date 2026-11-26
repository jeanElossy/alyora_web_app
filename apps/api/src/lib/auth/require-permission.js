import { hasPermission, isPermission } from '@alyora/shared';
import { AppError } from '../errors/app-error.js';
import { getValidated } from '../http/validate.js';
import { getAuth } from './require-auth.js';

/** @typedef {import('@alyora/shared').Permission} Permission */

/**
 * Accès d'un compte à un événement : ce que le résolveur renvoie pour un collaborateur actif.
 *
 * @typedef {object} EventAccess
 * @property {string} eventId
 * @property {string} organizationId
 * @property {string} collaboratorId
 * @property {import('@alyora/shared').EventRole} role
 * @property {ReadonlyArray<Permission>} permissions Permissions effectives, figées.
 */

/**
 * @typedef {object} EventAccessResolver
 * @property {(key: { eventId: string, userId: string }) => Promise<EventAccess | null>} resolve
 *   null si le compte n'est pas un collaborateur actif de l'événement (ou si l'événement
 *   n'existe pas : les deux cas sont indiscernables).
 */

/**
 * Accès résolu de chaque requête, rangé hors de `req` (comme l'identité) et lu par
 * getEventAccess().
 *
 * @type {WeakMap<object, EventAccess>}
 */
const accessByRequest = new WeakMap();

/**
 * Gardes d'autorisation, à placer après requireAuth (route → validateur Zod → auth →
 * permission → controller). La route doit valider un paramètre `eventId`
 * (eventIdParamsSchema).
 *
 * - Le compte n'est pas un collaborateur actif de l'événement, ou l'événement n'existe pas :
 *   404 NOT_FOUND. Jamais 403, qui confirmerait l'existence de l'événement.
 * - Le compte est collaborateur sans la permission demandée : 403 FORBIDDEN.
 *
 * Les permissions sont résolues une seule fois par requête, même si plusieurs gardes se
 * suivent.
 *
 * @param {{ resolver: EventAccessResolver }} deps
 */
export function createPermissionGuards({ resolver }) {
  /**
   * @param {import('express').Request} req
   * @returns {Promise<EventAccess>}
   */
  async function resolveAccess(req) {
    const known = accessByRequest.get(req);
    if (known) {
      return known;
    }
    const params = /** @type {{ eventId?: unknown }} */ (getValidated(req, 'params'));
    if (typeof params.eventId !== 'string') {
      throw new Error('requirePermission(): the route does not validate an eventId parameter');
    }
    const access = await resolver.resolve({ eventId: params.eventId, userId: getAuth(req).userId });
    if (!access) {
      throw new AppError('NOT_FOUND');
    }
    accessByRequest.set(req, access);
    return access;
  }

  return {
    /**
     * Exige d'être un collaborateur actif de l'événement, sans permission particulière.
     *
     * @returns {import('express').RequestHandler}
     */
    requireEventAccess() {
      return async (req, _res, next) => {
        await resolveAccess(req);
        next();
      };
    },

    /**
     * Exige une permission du catalogue sur l'événement de la requête. Une permission inconnue
     * fait échouer le démarrage : une faute de frappe ne peut pas ouvrir ni fermer une route
     * en silence.
     *
     * @param {Permission} permission
     * @returns {import('express').RequestHandler}
     */
    requirePermission(permission) {
      if (!isPermission(permission)) {
        throw new TypeError(`requirePermission(): unknown permission "${String(permission)}"`);
      }
      return async (req, _res, next) => {
        const access = await resolveAccess(req);
        if (!hasPermission(access.permissions, permission)) {
          throw new AppError('FORBIDDEN');
        }
        next();
      };
    },
  };
}

/** @typedef {ReturnType<typeof createPermissionGuards>} PermissionGuards */

/**
 * Accès de la requête à son événement, posé par requireEventAccess ou requirePermission.
 *
 * @param {import('express').Request} req
 * @returns {EventAccess}
 * @throws {Error} Si aucune garde d'autorisation n'a tourné : une erreur de programmation.
 */
export function getEventAccess(req) {
  const access = accessByRequest.get(req);
  if (!access) {
    throw new Error('getEventAccess(): no permission guard ran for this request');
  }
  return access;
}
