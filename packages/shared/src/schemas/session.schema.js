import { z } from 'zod';

/**
 * Réponse de POST /api/v1/auth/refresh. Contrat provisoire, posé par le client web (M0.3) avant
 * le module d'authentification, qui le confirmera : le refresh token voyage dans un cookie
 * HttpOnly, seul l'access token court est renvoyé dans le corps, et le client le garde en
 * mémoire.
 */
export const refreshSessionResponseSchema = z.strictObject({
  accessToken: z.string().min(1),
});

/** @typedef {z.infer<typeof refreshSessionResponseSchema>} RefreshSessionResponse */
