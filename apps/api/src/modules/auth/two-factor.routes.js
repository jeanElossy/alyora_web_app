import {
  RECENT_AUTH_MINUTES,
  backupCodesResponseSchema,
  changePasswordRequestSchema,
  reauthenticateRequestSchema,
  refreshSessionResponseSchema,
  twoFactorDisableRequestSchema,
  twoFactorEnableRequestSchema,
  twoFactorSetupResponseSchema,
  twoFactorVerifyRequestSchema,
} from '@alyora/shared';
import { noStore } from '../../lib/http/security.js';
import { defineRoute } from '../../lib/openapi/registry.js';

const TAGS = ['auth'];

/**
 * Routes de la double authentification, de la réauthentification et du changement de mot de
 * passe. Les opérations sensibles exigent une authentification de moins de
 * RECENT_AUTH_MINUTES minutes (requireRecentAuth).
 *
 * @param {object} deps
 * @param {ReturnType<typeof import('./two-factor.controller.js').createTwoFactorController>} deps.controller
 * @param {import('../../lib/auth/require-auth.js').AuthGuards} deps.guards
 * @param {import('../../lib/http/csrf.js').CsrfProtection} deps.csrf
 * @param {import('./auth-rate-limits.js').AuthRateLimits} deps.limits
 */
export function createTwoFactorRoutes({ controller, guards, csrf, limits }) {
  const before = [noStore(), csrf.requireCsrf()];
  const sensitive = [guards.requireAuth(), guards.requireRecentAuth(RECENT_AUTH_MINUTES)];

  return Object.freeze([
    defineRoute({
      method: 'post',
      path: '/auth/2fa/verify',
      summary: 'Second step of a login when 2FA is on: a TOTP code or a backup code',
      tags: TAGS,
      before: [...before, limits.twoFactorPerIp],
      request: { body: twoFactorVerifyRequestSchema },
      responses: { 200: { description: 'Signed in', schema: refreshSessionResponseSchema } },
      handler: controller.verify,
    }),
    defineRoute({
      method: 'post',
      path: '/auth/2fa/setup',
      summary: 'Prepares a new TOTP secret and its QR code (not active until enabled)',
      tags: TAGS,
      authenticated: true,
      before,
      after: sensitive,
      responses: { 200: { description: 'To scan', schema: twoFactorSetupResponseSchema } },
      handler: controller.setup,
    }),
    defineRoute({
      method: 'post',
      path: '/auth/2fa/enable',
      summary: 'Turns 2FA on with a first code; returns the backup codes, once',
      tags: TAGS,
      authenticated: true,
      before,
      request: { body: twoFactorEnableRequestSchema },
      after: [...sensitive, limits.secretPerAccount],
      responses: { 200: { description: 'Backup codes', schema: backupCodesResponseSchema } },
      handler: controller.enable,
    }),
    defineRoute({
      method: 'post',
      path: '/auth/2fa/disable',
      summary: 'Turns 2FA off, with a TOTP code or a backup code',
      tags: TAGS,
      authenticated: true,
      before,
      request: { body: twoFactorDisableRequestSchema },
      after: [...sensitive, limits.secretPerAccount],
      responses: { 204: { description: '2FA turned off' } },
      handler: controller.disable,
    }),
    defineRoute({
      method: 'post',
      path: '/auth/reauthenticate',
      summary: 'Confirms the password (and second factor) for a sensitive operation',
      tags: TAGS,
      authenticated: true,
      before,
      request: { body: reauthenticateRequestSchema },
      after: [guards.requireAuth({ allowUnverified: true }), limits.secretPerAccount],
      responses: {
        200: { description: 'Fresh access token', schema: refreshSessionResponseSchema },
      },
      handler: controller.reauthenticate,
    }),
    defineRoute({
      method: 'post',
      path: '/auth/password',
      summary: 'Changes the password; signs out the other devices',
      tags: TAGS,
      authenticated: true,
      before,
      request: { body: changePasswordRequestSchema },
      after: sensitive,
      responses: { 204: { description: 'Password changed' } },
      handler: controller.changePassword,
    }),
  ]);
}
