import { getAuth } from '../auth/require-auth.js';
import { getEventAccess } from '../auth/require-permission.js';
import { createServiceContext } from './service-context.js';

/**
 * Contexte de service d'une requête sur un événement, construit par le controller : le compte
 * (requireAuth), l'événement, son organisation et les permissions résolues (requirePermission).
 * Le service filtre chaque requête Mongo avec `eventId` de ce contexte.
 *
 * @param {import('express').Request} req
 * @returns {Readonly<import('./service-context.js').ServiceContext>}
 */
export function eventServiceContext(req) {
  const { userId, sessionId } = getAuth(req);
  const { eventId, organizationId, permissions } = getEventAccess(req);
  return createServiceContext({
    userId,
    authSessionId: sessionId,
    eventId,
    organizationId,
    permissions,
    ip: req.ip ?? '',
    userAgent: req.get('User-Agent') ?? '',
  });
}
