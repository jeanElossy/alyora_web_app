import {
  RECENT_AUTH_MINUTES,
  collaboratorListResponseSchema,
  collaboratorParamsSchema,
  collaboratorSchema,
  cursorPageQuerySchema,
  eventIdParamsSchema,
  ownershipTransferRequestSchema,
  ownershipTransferResponseSchema,
  updateCollaboratorRequestSchema,
} from '@alyora/shared';
import { getAuth } from '../../lib/auth/require-auth.js';
import { noStore } from '../../lib/http/security.js';
import { getValidated } from '../../lib/http/validate.js';
import { defineRoute } from '../../lib/openapi/registry.js';

const TAGS = ['access'];

/**
 * Ce qui définit une requête idempotente : le compte, l'événement et le corps. Une même clé
 * présentée par un autre compte, ou sur un autre événement, est un conflit, jamais le rejeu
 * d'une réponse qui ne lui appartient pas.
 *
 * @param {import('express').Request} req
 */
export const idempotencyFingerprint = (req) => ({
  userId: getAuth(req).userId,
  params: getValidated(req, 'params'),
  body: getValidated(req, 'body'),
});

/**
 * @typedef {object} CollaborationRouteDeps
 * @property {import('./collaboration.controller.js').CollaborationController} controller
 * @property {import('../auth/auth-module.js').AuthModule} auth Gardes et protection CSRF.
 * @property {import('../../lib/auth/require-permission.js').PermissionGuards} permissionGuards
 * @property {import('../../lib/idempotency/idempotent.js').Idempotency} idempotency
 * @property {import('./access-rate-limits.js').AccessRateLimits} limits
 */

/**
 * Routes /api/v1/events/:eventId/collaborators et le transfert de propriété. Pour chacune :
 * pas de cache, CSRF sur toute route qui modifie l'état, validation, authentification, accès à
 * l'événement et permission, puis idempotence.
 *
 * @param {CollaborationRouteDeps} deps
 */
export function createCollaboratorRoutes({ controller, auth, permissionGuards, idempotency }) {
  const read = [noStore()];
  const write = [noStore(), auth.csrf.requireCsrf()];
  const signedIn = auth.guards.requireAuth();

  return Object.freeze([
    defineRoute({
      method: 'get',
      path: '/events/:eventId/collaborators',
      summary: 'Active collaborators of the event, by page (cursor)',
      tags: TAGS,
      authenticated: true,
      before: read,
      request: { params: eventIdParamsSchema, query: cursorPageQuerySchema },
      after: [signedIn, permissionGuards.requirePermission('collaborators:read')],
      responses: {
        200: { description: 'A page of collaborators', schema: collaboratorListResponseSchema },
      },
      handler: controller.listCollaborators,
    }),
    defineRoute({
      method: 'patch',
      path: '/events/:eventId/collaborators/:collaboratorId',
      summary: "Replaces a collaborator's role, within the caller's own permissions",
      tags: TAGS,
      authenticated: true,
      before: write,
      request: { params: collaboratorParamsSchema, body: updateCollaboratorRequestSchema },
      after: [signedIn, permissionGuards.requirePermission('collaborators:manage')],
      responses: { 200: { description: 'The collaborator', schema: collaboratorSchema } },
      handler: controller.updateCollaborator,
    }),
    defineRoute({
      method: 'delete',
      path: '/events/:eventId/collaborators/:collaboratorId',
      summary: "Revokes a collaborator's access (logical, immediate)",
      tags: TAGS,
      authenticated: true,
      before: write,
      request: { params: collaboratorParamsSchema },
      after: [signedIn, permissionGuards.requirePermission('collaborators:manage')],
      responses: { 204: { description: 'Access revoked' } },
      handler: controller.revokeCollaborator,
    }),
    defineRoute({
      method: 'post',
      path: '/events/:eventId/ownership-transfer',
      summary: 'Transfers the ownership to an active collaborator (owner only, recent auth, 2FA)',
      tags: TAGS,
      authenticated: true,
      before: write,
      request: { params: eventIdParamsSchema, body: ownershipTransferRequestSchema },
      after: [
        signedIn,
        // D'abord l'accès à l'événement : un compte étranger reçoit 404, quoi qu'il en soit.
        permissionGuards.requireEventAccess(),
        auth.guards.requireRecentAuth(RECENT_AUTH_MINUTES),
        auth.guards.requireTwoFactorEnabled(),
        idempotency.idempotent({
          scope: 'POST /events/:eventId/ownership-transfer',
          fingerprint: idempotencyFingerprint,
        }),
      ],
      responses: {
        200: { description: 'Ownership transferred', schema: ownershipTransferResponseSchema },
      },
      handler: controller.transferOwnership,
    }),
  ]);
}
