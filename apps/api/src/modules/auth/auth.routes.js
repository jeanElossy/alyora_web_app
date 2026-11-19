import {
  acceptedResponseSchema,
  authSessionListResponseSchema,
  csrfTokenResponseSchema,
  currentUserSchema,
  emailRequestSchema,
  emailVerifiedResponseSchema,
  loginRequestSchema,
  loginResultSchema,
  passwordResetResponseSchema,
  refreshSessionResponseSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  sessionIdParamsSchema,
  updateProfileRequestSchema,
  verifyEmailRequestSchema,
} from '@alyora/shared';
import { noStore } from '../../lib/http/security.js';
import { getValidated } from '../../lib/http/validate.js';
import { defineRoute } from '../../lib/openapi/registry.js';

const TAGS = ['auth'];

/**
 * Routes /api/v1/auth. Pour chacune, dans l'ordre : pas de cache ni de compression, CSRF sur
 * toute route qui modifie l'état, limites par IP, validation, puis authentification, limites
 * qui lisent le corps validé et idempotence.
 *
 * @param {object} deps
 * @param {import('./auth.controller.js').AuthController} deps.controller
 * @param {import('../../lib/auth/require-auth.js').AuthGuards} deps.guards
 * @param {import('../../lib/http/csrf.js').CsrfProtection} deps.csrf
 * @param {import('../../lib/idempotency/idempotent.js').Idempotency} deps.idempotency
 * @param {import('./auth-rate-limits.js').AuthRateLimits} deps.limits
 */
export function createAuthRoutes({ controller, guards, csrf, idempotency, limits }) {
  const privateResponse = noStore();
  const requireCsrf = csrf.requireCsrf();
  const signedIn = guards.requireAuth();
  const signedInUnverified = guards.requireAuth({ allowUnverified: true });

  return Object.freeze([
    defineRoute({
      method: 'get',
      path: '/auth/csrf',
      summary: 'Issues a CSRF token (body and HttpOnly cookie) for state-changing requests',
      tags: TAGS,
      before: [privateResponse],
      responses: { 200: { description: 'A fresh token', schema: csrfTokenResponseSchema } },
      handler: controller.csrfToken,
    }),
    defineRoute({
      method: 'post',
      path: '/auth/register',
      summary: 'Creates an account; same answer whether the address is free or not',
      tags: TAGS,
      before: [privateResponse, requireCsrf, limits.registerPerIp],
      request: { body: registerRequestSchema },
      after: [
        limits.registerPerAccount,
        idempotency.idempotent({
          scope: 'POST /auth/register',
          // Le mot de passe n'entre jamais dans l'empreinte stockée.
          fingerprint: (req) => withoutPassword(getValidated(req, 'body')),
        }),
      ],
      responses: { 202: { description: 'Request accepted', schema: acceptedResponseSchema } },
      handler: controller.register,
    }),
    defineRoute({
      method: 'post',
      path: '/auth/verify-email',
      summary: 'Verifies the e-mail address with the token sent by e-mail',
      tags: TAGS,
      before: [privateResponse, requireCsrf, limits.tokenPerIp],
      request: { body: verifyEmailRequestSchema },
      responses: {
        200: { description: 'Address verified', schema: emailVerifiedResponseSchema },
      },
      handler: controller.verifyEmail,
    }),
    defineRoute({
      method: 'post',
      path: '/auth/resend-verification',
      summary: 'Sends a new verification link; same answer for any address',
      tags: TAGS,
      before: [privateResponse, requireCsrf, limits.emailPerIp],
      request: { body: emailRequestSchema },
      after: [limits.emailPerAddress, limits.emailPerAccount],
      responses: { 202: { description: 'Request accepted', schema: acceptedResponseSchema } },
      handler: controller.resendVerification,
    }),
    defineRoute({
      method: 'post',
      path: '/auth/login',
      summary: 'Signs in; the refresh token is set in an HttpOnly cookie',
      tags: TAGS,
      before: [privateResponse, requireCsrf, limits.loginPerIp],
      request: { body: loginRequestSchema },
      after: [limits.loginPerAccount],
      responses: {
        200: {
          description: 'Signed in, or the two-factor step when 2FA is on',
          schema: loginResultSchema,
        },
      },
      handler: controller.login,
    }),
    defineRoute({
      method: 'post',
      path: '/auth/refresh',
      summary: 'Rotates the refresh token (cookie) and returns a new access token',
      tags: TAGS,
      before: [privateResponse, requireCsrf],
      responses: {
        200: { description: 'Session renewed', schema: refreshSessionResponseSchema },
      },
      handler: controller.refresh,
    }),
    defineRoute({
      method: 'post',
      path: '/auth/logout',
      summary: 'Signs out the current device',
      tags: TAGS,
      authenticated: true,
      before: [privateResponse, requireCsrf],
      after: [signedInUnverified],
      responses: { 204: { description: 'Signed out' } },
      handler: controller.logout,
    }),
    defineRoute({
      method: 'post',
      path: '/auth/logout-all',
      summary: 'Signs out every device of the account',
      tags: TAGS,
      authenticated: true,
      before: [privateResponse, requireCsrf],
      after: [signedInUnverified],
      responses: { 204: { description: 'Signed out everywhere' } },
      handler: controller.logoutAll,
    }),
    defineRoute({
      method: 'post',
      path: '/auth/forgot-password',
      summary: 'Sends a password reset link; same answer for any address',
      tags: TAGS,
      before: [privateResponse, requireCsrf, limits.emailPerIp],
      request: { body: emailRequestSchema },
      after: [limits.emailPerAddress, limits.emailPerAccount],
      responses: { 202: { description: 'Request accepted', schema: acceptedResponseSchema } },
      handler: controller.forgotPassword,
    }),
    defineRoute({
      method: 'post',
      path: '/auth/reset-password',
      summary: 'Sets a new password with the token sent by e-mail; signs out every device',
      tags: TAGS,
      before: [privateResponse, requireCsrf, limits.tokenPerIp],
      request: { body: resetPasswordRequestSchema },
      responses: { 200: { description: 'Password replaced', schema: passwordResetResponseSchema } },
      handler: controller.resetPassword,
    }),
    defineRoute({
      method: 'get',
      path: '/auth/me',
      summary: 'The signed-in account',
      tags: TAGS,
      authenticated: true,
      before: [privateResponse],
      after: [signedInUnverified],
      responses: { 200: { description: 'The account', schema: currentUserSchema } },
      handler: controller.me,
    }),
    defineRoute({
      method: 'patch',
      path: '/auth/me',
      summary: 'Updates the profile of the signed-in account',
      tags: TAGS,
      authenticated: true,
      before: [privateResponse, requireCsrf],
      request: { body: updateProfileRequestSchema },
      after: [signedIn],
      responses: { 200: { description: 'The updated account', schema: currentUserSchema } },
      handler: controller.updateMe,
    }),
    defineRoute({
      method: 'get',
      path: '/auth/sessions',
      summary: 'Active sessions (devices) of the account',
      tags: TAGS,
      authenticated: true,
      before: [privateResponse],
      after: [signedIn],
      responses: { 200: { description: 'Sessions', schema: authSessionListResponseSchema } },
      handler: controller.listSessions,
    }),
    defineRoute({
      method: 'delete',
      path: '/auth/sessions/:sessionId',
      summary: 'Revokes a session of the account; it can no longer refresh',
      tags: TAGS,
      authenticated: true,
      before: [privateResponse, requireCsrf],
      request: { params: sessionIdParamsSchema },
      after: [signedIn],
      responses: { 204: { description: 'Session revoked' } },
      handler: controller.revokeSession,
    }),
  ]);
}

/**
 * Le corps validé, sans le mot de passe : ce qui définit la requête pour l'idempotence.
 *
 * @param {unknown} body
 * @returns {Record<string, unknown>}
 */
function withoutPassword(body) {
  return Object.fromEntries(
    Object.entries(/** @type {Record<string, unknown>} */ (body)).filter(
      ([key]) => key !== 'password',
    ),
  );
}
