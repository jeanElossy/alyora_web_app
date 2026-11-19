import { z } from 'zod';
import { BACKUP_CODE_COUNT } from '../constants/auth.js';
import {
  emailedTokenSchema,
  newPasswordSchema,
  passwordInputSchema,
} from './auth-fields.schema.js';
import { refreshSessionResponseSchema } from './session.schema.js';

/** Code à 6 chiffres d'une application d'authentification. */
export const otpSchema = z.string().regex(/^\d{6}$/);

/**
 * Code de secours : 10 caractères base32, saisis avec ou sans tiret, en majuscules ou non
 * (« abcde-fgh23 »). Normalisé sans tiret, en majuscules.
 */
export const backupCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-7]{5}-?[A-Z2-7]{5}$/)
  .transform((value) => value.replace('-', ''));

/**
 * Un second facteur : un code de l'application, ou un code de secours, jamais les deux.
 *
 * @template {z.ZodRawShape} T
 * @param {T} shape
 */
function withSecondFactor(shape) {
  return z
    .strictObject({ ...shape, otp: otpSchema.optional(), backupCode: backupCodeSchema.optional() })
    .refine(
      (value) => {
        const { otp, backupCode } = /** @type {{ otp?: string, backupCode?: string }} */ (value);
        return (otp === undefined) !== (backupCode === undefined);
      },
      { message: 'Exactly one of otp and backupCode is expected' },
    );
}

/** POST /auth/2fa/verify : seconde étape de la connexion. */
export const twoFactorVerifyRequestSchema = withSecondFactor({
  challengeToken: emailedTokenSchema,
});

/** POST /auth/2fa/enable : le premier code, qui prouve que l'application est réglée. */
export const twoFactorEnableRequestSchema = z.strictObject({ otp: otpSchema });

/** POST /auth/2fa/disable */
export const twoFactorDisableRequestSchema = withSecondFactor({});

/**
 * POST /auth/reauthenticate : le mot de passe, et le second facteur si la 2FA est active
 * (vérifié par l'API, qui seule sait si elle l'est).
 */
export const reauthenticateRequestSchema = z
  .strictObject({
    password: passwordInputSchema,
    otp: otpSchema.optional(),
    backupCode: backupCodeSchema.optional(),
  })
  .refine((value) => value.otp === undefined || value.backupCode === undefined, {
    message: 'At most one of otp and backupCode is expected',
  });

/** POST /auth/password */
export const changePasswordRequestSchema = z.strictObject({ newPassword: newPasswordSchema });

/** Réponse de connexion quand la 2FA est active : le mot de passe est bon, un code est attendu. */
export const twoFactorChallengeResponseSchema = z.strictObject({
  status: z.literal('two_factor_required'),
  challengeToken: z.string().min(1),
});

/** POST /auth/login : la session, ou l'étape 2FA. */
export const loginResultSchema = z.union([
  refreshSessionResponseSchema,
  twoFactorChallengeResponseSchema,
]);

/** POST /auth/2fa/setup : de quoi régler l'application, une seule fois. */
export const twoFactorSetupResponseSchema = z.strictObject({
  secret: z.string().min(16),
  otpauthUri: z.string().startsWith('otpauth://totp/'),
  qrCodeDataUrl: z.string().startsWith('data:image/svg+xml;base64,'),
});

/** POST /auth/2fa/enable : les codes de secours, montrés une seule fois. */
export const backupCodesResponseSchema = z.strictObject({
  backupCodes: z.array(z.string()).length(BACKUP_CODE_COUNT),
});

/** @typedef {z.infer<typeof twoFactorVerifyRequestSchema>} TwoFactorVerifyRequest */
/** @typedef {z.infer<typeof twoFactorDisableRequestSchema>} TwoFactorDisableRequest */
/** @typedef {z.infer<typeof reauthenticateRequestSchema>} ReauthenticateRequest */
/** @typedef {z.infer<typeof changePasswordRequestSchema>} ChangePasswordRequest */
