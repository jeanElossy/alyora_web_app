import { createAuditLog } from '../../lib/audit/audit-log.js';
import { createPermissionGuards } from '../../lib/auth/require-permission.js';
import { createIdempotency } from '../../lib/idempotency/idempotent.js';
import { systemClock } from '../auth/auth-module.js';
import { createAccessEmails } from './access-emails.js';
import { createAccessRateLimits } from './access-rate-limits.js';
import { createAccessController } from './access.controller.js';
import { createAccessRoutes } from './access.routes.js';
import { createCollaborationController } from './collaboration.controller.js';
import { createCollaboratorRoutes } from './collaborators.routes.js';
import { createInvitationRoutes } from './invitations.routes.js';
import { createAccessServices } from './services/access-services.js';
import { createPermissionResolver } from './services/permission-resolver.js';

/**
 * @typedef {object} AccessModuleDependencies
 * @property {import('../../config/load-config.js').AppConfig} config
 * @property {import('pino').Logger} logger
 * @property {import('../../lib/mail/mail-queue.js').Mailer} mailer
 * @property {(name: string) => import('express-rate-limit').Store} createRateLimitStore
 * @property {import('./services/permission-cache.js').PermissionCache} permissionCache
 * @property {import('../auth/auth-module.js').AuthModule} auth Gardes, CSRF et empreintes.
 * @property {{ now: () => Date }} [clock]
 */

/**
 * Assemble le module des autorisations : résolution des permissions (avec son cache), gardes,
 * services de l'équipe d'un événement et routes. Les gardes (requirePermission) et le
 * résolveur (invalidate) sont exposés pour les autres modules.
 *
 * @param {AccessModuleDependencies} deps
 */
export function createAccessModule({
  config,
  logger,
  mailer,
  createRateLimitStore,
  permissionCache,
  auth,
  clock = systemClock,
}) {
  const resolver = createPermissionResolver({ cache: permissionCache, logger });
  const permissionGuards = createPermissionGuards({ resolver });
  const { keyedHasher } = auth;
  const services = createAccessServices({
    clock,
    logger,
    mailer,
    emails: createAccessEmails({ webAppUrl: config.auth.webAppUrl }),
    auditLog: createAuditLog({ keyedHasher, clock }),
    resolver,
  });
  const routeDeps = {
    controller: createCollaborationController({ services }),
    auth,
    permissionGuards,
    idempotency: createIdempotency({ keyedHasher, clock, logger }),
    limits: createAccessRateLimits({ createStore: createRateLimitStore, keyedHasher, logger }),
  };
  const routes = Object.freeze([
    ...createAccessRoutes({
      controller: createAccessController(),
      authGuards: auth.guards,
      permissionGuards,
    }),
    ...createCollaboratorRoutes(routeDeps),
    ...createInvitationRoutes(routeDeps),
  ]);
  return { routes, resolver, guards: permissionGuards, services };
}

/** @typedef {ReturnType<typeof createAccessModule>} AccessModule */
