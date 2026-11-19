export {
  accountTypeSchema,
  emailSchema,
  emailedTokenSchema,
  localeSchema,
  newPasswordSchema,
  passwordInputSchema,
  personNameSchema,
  phoneSchema,
  timeZoneSchema,
} from './auth-fields.schema.js';
export {
  acceptedResponseSchema,
  authSessionListResponseSchema,
  authSessionSchema,
  csrfTokenResponseSchema,
  currentUserSchema,
  emailVerifiedResponseSchema,
  loginResponseSchema,
  passwordResetResponseSchema,
} from './auth-response.schema.js';
export {
  emailRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  sessionIdParamsSchema,
  updateProfileRequestSchema,
  verifyEmailRequestSchema,
} from './auth.schema.js';
export { designSystemDemoFormSchema } from './demo.schema.js';
export {
  errorDetailsSchema,
  errorIssueSchema,
  errorResponseSchema,
} from './error-response.schema.js';
export { pingResponseSchema } from './ping.schema.js';
export { refreshSessionResponseSchema } from './session.schema.js';

// Types réexportés (un typedef JSDoc n'est pas transmis par `export ... from`).
/** @typedef {import('./error-response.schema.js').ErrorIssue} ErrorIssue */
/** @typedef {import('./error-response.schema.js').ErrorDetails} ErrorDetails */
/** @typedef {import('./error-response.schema.js').ErrorResponse} ErrorResponse */
/** @typedef {import('./ping.schema.js').PingResponse} PingResponse */
/** @typedef {import('./session.schema.js').RefreshSessionResponse} RefreshSessionResponse */
/** @typedef {import('./auth.schema.js').RegisterRequest} RegisterRequest */
/** @typedef {import('./auth.schema.js').LoginRequest} LoginRequest */
/** @typedef {import('./auth.schema.js').EmailRequest} EmailRequest */
/** @typedef {import('./auth.schema.js').VerifyEmailRequest} VerifyEmailRequest */
/** @typedef {import('./auth.schema.js').ResetPasswordRequest} ResetPasswordRequest */
/** @typedef {import('./auth.schema.js').UpdateProfileRequest} UpdateProfileRequest */
/** @typedef {import('./auth-response.schema.js').CurrentUser} CurrentUser */
/** @typedef {import('./auth-response.schema.js').AuthSession} AuthSession */
