import { createPermissionGuards } from '../../lib/auth/require-permission.js';
import { createAccessController } from './access.controller.js';
import { createAccessRoutes } from './access.routes.js';
import { createPermissionResolver } from './services/permission-resolver.js';

/**
 * @typedef {object} AccessModuleDependencies
 * @property {import('pino').Logger} logger
 * @property {import('./services/permission-cache.js').PermissionCache} permissionCache
 * @property {import('../../lib/auth/require-auth.js').AuthGuards} authGuards
 */

/**
 * Assemble le module des autorisations : résolution des permissions (avec son cache), gardes
 * et routes. Les gardes (requirePermission) et le résolveur (invalidate) sont exposés pour les
 * autres modules.
 *
 * @param {AccessModuleDependencies} deps
 */
export function createAccessModule({ logger, permissionCache, authGuards }) {
  const resolver = createPermissionResolver({ cache: permissionCache, logger });
  const permissionGuards = createPermissionGuards({ resolver });
  const routes = createAccessRoutes({
    controller: createAccessController(),
    authGuards,
    permissionGuards,
  });
  return { routes, resolver, guards: permissionGuards };
}

/** @typedef {ReturnType<typeof createAccessModule>} AccessModule */
