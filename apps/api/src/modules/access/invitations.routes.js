import {
  acceptInvitationRequestSchema,
  collaboratorSchema,
  createInvitationRequestSchema,
  cursorPageQuerySchema,
  eventIdParamsSchema,
  invitationListResponseSchema,
  invitationParamsSchema,
  invitationSchema,
} from '@alyora/shared';
import { noStore } from '../../lib/http/security.js';
import { defineRoute } from '../../lib/openapi/registry.js';
import { idempotencyFingerprint } from './collaborators.routes.js';

const TAGS = ['access'];

/**
 * Routes /api/v1/events/:eventId/invitations. Créer et accepter une invitation exigent
 * Idempotency-Key (unicité d'une invitation en attente, d'un accès actif).
 *
 * @param {import('./collaborators.routes.js').CollaborationRouteDeps} deps
 */
export function createInvitationRoutes({
  controller,
  auth,
  permissionGuards,
  idempotency,
  limits,
}) {
  const read = [noStore()];
  const write = [noStore(), auth.csrf.requireCsrf()];
  const signedIn = auth.guards.requireAuth();

  return Object.freeze([
    defineRoute({
      method: 'get',
      path: '/events/:eventId/invitations',
      summary: 'Pending invitations of the event, by page (cursor); never their token',
      tags: TAGS,
      authenticated: true,
      before: read,
      request: { params: eventIdParamsSchema, query: cursorPageQuerySchema },
      after: [signedIn, permissionGuards.requirePermission('collaborators:read')],
      responses: {
        200: { description: 'A page of invitations', schema: invitationListResponseSchema },
      },
      handler: controller.listInvitations,
    }),
    defineRoute({
      method: 'post',
      path: '/events/:eventId/invitations',
      summary:
        "Invites an address with a role within the caller's own permissions; sends an e-mail",
      tags: TAGS,
      authenticated: true,
      before: write,
      request: { params: eventIdParamsSchema, body: createInvitationRequestSchema },
      after: [
        signedIn,
        permissionGuards.requirePermission('collaborators:invite'),
        limits.invitationsPerAccount,
        idempotency.idempotent({
          scope: 'POST /events/:eventId/invitations',
          fingerprint: idempotencyFingerprint,
        }),
      ],
      responses: { 201: { description: 'Invitation sent', schema: invitationSchema } },
      handler: controller.createInvitation,
    }),
    defineRoute({
      method: 'delete',
      path: '/events/:eventId/invitations/:invitationId',
      summary: 'Revokes a pending invitation',
      tags: TAGS,
      authenticated: true,
      before: write,
      request: { params: invitationParamsSchema },
      after: [signedIn, permissionGuards.requirePermission('collaborators:invite')],
      responses: { 204: { description: 'Invitation revoked' } },
      handler: controller.revokeInvitation,
    }),
    defineRoute({
      method: 'post',
      path: '/events/:eventId/invitations/accept',
      summary: 'Accepts an invitation sent to the address of the signed-in account',
      tags: TAGS,
      authenticated: true,
      before: [...write, limits.acceptPerIp],
      request: { params: eventIdParamsSchema, body: acceptInvitationRequestSchema },
      after: [
        signedIn,
        limits.acceptPerAccount,
        idempotency.idempotent({
          scope: 'POST /events/:eventId/invitations/accept',
          fingerprint: idempotencyFingerprint,
        }),
      ],
      responses: { 201: { description: 'Now a collaborator', schema: collaboratorSchema } },
      handler: controller.acceptInvitation,
    }),
  ]);
}
