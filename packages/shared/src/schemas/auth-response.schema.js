import { z } from 'zod';
import { ACCOUNT_TYPES, LOCALES } from '../constants/auth.js';
import { refreshSessionResponseSchema } from './session.schema.js';

// Corps des réponses de /api/v1/auth.

/** POST /auth/login : même contrat que le refresh, l'access token seul. */
export const loginResponseSchema = refreshSessionResponseSchema;

/**
 * Réponse des routes qui ne doivent rien révéler (inscription, renvoi du lien, mot de passe
 * oublié) : la même, que l'adresse corresponde à un compte ou non.
 */
export const acceptedResponseSchema = z.strictObject({
  status: z.literal('accepted'),
});

/** POST /auth/verify-email */
export const emailVerifiedResponseSchema = z.strictObject({
  status: z.literal('email_verified'),
});

/** POST /auth/reset-password */
export const passwordResetResponseSchema = z.strictObject({
  status: z.literal('password_reset'),
});

/** GET /auth/csrf */
export const csrfTokenResponseSchema = z.strictObject({
  csrfToken: z.string().min(1),
});

/** Le compte connecté, tel que le voit son titulaire (GET et PATCH /auth/me). */
export const currentUserSchema = z.strictObject({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  accountType: z.enum(ACCOUNT_TYPES),
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  twoFactorEnabled: z.boolean(),
  avatarUrl: z.string().nullable(),
  locale: z.enum(LOCALES),
  timezone: z.string(),
  createdAt: z.iso.datetime(),
});

/** Une session active du compte (appareil connecté). */
export const authSessionSchema = z.strictObject({
  id: z.string(),
  deviceLabel: z.string(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  current: z.boolean(),
});

/** GET /auth/sessions : bornée à MAX_ACTIVE_SESSIONS, la plus récemment utilisée d'abord. */
export const authSessionListResponseSchema = z.strictObject({
  sessions: z.array(authSessionSchema),
});

/** @typedef {z.infer<typeof currentUserSchema>} CurrentUser */
/** @typedef {z.infer<typeof authSessionSchema>} AuthSession */
