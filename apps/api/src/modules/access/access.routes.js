import { eventIdParamsSchema, myPermissionsResponseSchema } from '@alyora/shared';
import { noStore } from '../../lib/http/security.js';
import { defineRoute } from '../../lib/openapi/registry.js';

const TAGS = ['access'];

/**
 * Routes /api/v1/events/:eventId des autorisations. Réponses privées : jamais en cache.
 *
 * @param {object} deps
 * @param {import('./access.controller.js').AccessController} deps.controller
 * @param {import('../../lib/auth/require-auth.js').AuthGuards} deps.authGuards
 * @param {import('../../lib/auth/require-permission.js').PermissionGuards} deps.permissionGuards
 */
export function createAccessRoutes({ controller, authGuards, permissionGuards }) {
  return Object.freeze([
    defineRoute({
      method: 'get',
      path: '/events/:eventId/permissions/me',
      summary:
        "The caller's role and permissions on the event, for display only: every request is checked anyway",
      tags: TAGS,
      authenticated: true,
      before: [noStore()],
      request: { params: eventIdParamsSchema },
      after: [authGuards.requireAuth(), permissionGuards.requireEventAccess()],
      responses: {
        200: { description: 'Role and permissions', schema: myPermissionsResponseSchema },
      },
      handler: controller.myPermissions,
    }),
  ]);
}
