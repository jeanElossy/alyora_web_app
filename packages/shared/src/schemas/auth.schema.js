import { z } from 'zod';
import {
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
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

// Corps des requêtes de /api/v1/auth. Tous stricts : une clé inconnue est une erreur de
// validation, jamais ignorée en silence.

/** POST /auth/register */
export const registerRequestSchema = z.strictObject({
  email: emailSchema,
  password: newPasswordSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
  phone: phoneSchema.optional(),
  accountType: accountTypeSchema,
  locale: localeSchema.default(DEFAULT_LOCALE),
  timezone: timeZoneSchema.default(DEFAULT_TIMEZONE),
});

/** POST /auth/login */
export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  password: passwordInputSchema,
});

/** POST /auth/resend-verification et POST /auth/forgot-password */
export const emailRequestSchema = z.strictObject({
  email: emailSchema,
});

/** POST /auth/verify-email */
export const verifyEmailRequestSchema = z.strictObject({
  token: emailedTokenSchema,
});

/** POST /auth/reset-password */
export const resetPasswordRequestSchema = z.strictObject({
  token: emailedTokenSchema,
  password: newPasswordSchema,
});

/** PATCH /auth/me : au moins un champ. `phone: null` retire le numéro. */
export const updateProfileRequestSchema = z
  .strictObject({
    firstName: personNameSchema.optional(),
    lastName: personNameSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    accountType: accountTypeSchema.optional(),
    locale: localeSchema.optional(),
    timezone: timeZoneSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

/** Paramètres de DELETE /auth/sessions/:sessionId */
export const sessionIdParamsSchema = z.strictObject({
  sessionId: z.string().regex(/^[0-9a-f]{24}$/),
});

/** @typedef {z.infer<typeof registerRequestSchema>} RegisterRequest */
/** @typedef {z.infer<typeof loginRequestSchema>} LoginRequest */
/** @typedef {z.infer<typeof emailRequestSchema>} EmailRequest */
/** @typedef {z.infer<typeof verifyEmailRequestSchema>} VerifyEmailRequest */
/** @typedef {z.infer<typeof resetPasswordRequestSchema>} ResetPasswordRequest */
/** @typedef {z.infer<typeof updateProfileRequestSchema>} UpdateProfileRequest */
