import {
  IDEMPOTENCY_KEY_HEADER,
  acceptedResponseSchema,
  authSessionListResponseSchema,
  backupCodesResponseSchema,
  currentUserSchema,
  emailVerifiedResponseSchema,
  loginResultSchema,
  passwordResetResponseSchema,
  refreshSessionResponseSchema,
  twoFactorSetupResponseSchema,
} from '@alyora/shared';
import { apiClient } from '../../lib/api/api-client.js';
import { useSessionStore } from '../../lib/session/session-store.js';

// Appels de /api/v1/auth, toujours par le client API (jamais fetch). Chaque réponse est
// validée par son schéma partagé : une réponse inattendue est une erreur, pas une donnée.

/** @typedef {import('@alyora/shared/schemas').CurrentUser} CurrentUser */

/**
 * Garde l'access token reçu, en mémoire seulement.
 *
 * @param {string} accessToken
 */
const keepSession = (accessToken) => useSessionStore.getState().setAccessToken(accessToken);

export const authApi = {
  /**
   * @param {import('@alyora/shared/schemas').LoginRequest} input
   * @returns {Promise<{ signedIn: true } | { signedIn: false, challengeToken: string }>}
   */
  async login(input) {
    const result = loginResultSchema.parse(
      await apiClient.request('/auth/login', { method: 'POST', body: input }),
    );
    if ('accessToken' in result) {
      keepSession(result.accessToken);
      return { signedIn: true };
    }
    return { signedIn: false, challengeToken: result.challengeToken };
  },

  /** @param {import('@alyora/shared/schemas').TwoFactorVerifyRequest} input */
  async verifyTwoFactor(input) {
    const { accessToken } = refreshSessionResponseSchema.parse(
      await apiClient.request('/auth/2fa/verify', { method: 'POST', body: input }),
    );
    keepSession(accessToken);
  },

  /**
   * @param {import('@alyora/shared/schemas').RegisterRequest} input
   * @param {string} idempotencyKey Le même pour les nouvelles tentatives d'un même envoi.
   */
  async register(input, idempotencyKey) {
    acceptedResponseSchema.parse(
      await apiClient.request('/auth/register', {
        method: 'POST',
        body: input,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      }),
    );
  },

  /** @param {string} token */
  async verifyEmail(token) {
    emailVerifiedResponseSchema.parse(
      await apiClient.request('/auth/verify-email', { method: 'POST', body: { token } }),
    );
  },

  /** @param {string} email */
  async resendVerification(email) {
    acceptedResponseSchema.parse(
      await apiClient.request('/auth/resend-verification', { method: 'POST', body: { email } }),
    );
  },

  /** @param {string} email */
  async forgotPassword(email) {
    acceptedResponseSchema.parse(
      await apiClient.request('/auth/forgot-password', { method: 'POST', body: { email } }),
    );
  },

  /** @param {{ token: string, password: string }} input */
  async resetPassword(input) {
    passwordResetResponseSchema.parse(
      await apiClient.request('/auth/reset-password', { method: 'POST', body: input }),
    );
    // Toutes les sessions du compte sont révoquées, celle-ci comprise.
    useSessionStore.getState().clear();
  },

  /** @returns {Promise<CurrentUser>} */
  async me() {
    return currentUserSchema.parse(await apiClient.request('/auth/me'));
  },

  /**
   * @param {import('@alyora/shared/schemas').UpdateProfileRequest} changes
   * @returns {Promise<CurrentUser>}
   */
  async updateMe(changes) {
    return currentUserSchema.parse(
      await apiClient.request('/auth/me', { method: 'PATCH', body: changes }),
    );
  },

  async sessions() {
    return authSessionListResponseSchema.parse(await apiClient.request('/auth/sessions')).sessions;
  },

  /** @param {string} sessionId */
  async revokeSession(sessionId) {
    await apiClient.request(`/auth/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  },

  /** Déconnexion de cet appareil ; la session locale est effacée même si l'API échoue. */
  async logout() {
    try {
      await apiClient.request('/auth/logout', { method: 'POST' });
    } finally {
      useSessionStore.getState().clear();
    }
  },

  async logoutAll() {
    try {
      await apiClient.request('/auth/logout-all', { method: 'POST' });
    } finally {
      useSessionStore.getState().clear();
    }
  },

  async twoFactorSetup() {
    return twoFactorSetupResponseSchema.parse(
      await apiClient.request('/auth/2fa/setup', { method: 'POST' }),
    );
  },

  /** @param {string} otp */
  async twoFactorEnable(otp) {
    return backupCodesResponseSchema.parse(
      await apiClient.request('/auth/2fa/enable', { method: 'POST', body: { otp } }),
    ).backupCodes;
  },

  /** @param {{ otp?: string, backupCode?: string }} factor */
  async twoFactorDisable(factor) {
    await apiClient.request('/auth/2fa/disable', { method: 'POST', body: factor });
  },

  /** @param {import('@alyora/shared/schemas').ReauthenticateRequest} input */
  async reauthenticate(input) {
    const { accessToken } = refreshSessionResponseSchema.parse(
      await apiClient.request('/auth/reauthenticate', { method: 'POST', body: input }),
    );
    keepSession(accessToken);
  },

  /** @param {string} newPassword */
  async changePassword(newPassword) {
    await apiClient.request('/auth/password', { method: 'POST', body: { newPassword } });
  },

  /**
   * Après la vérification de l'adresse : si une session est ouverte, son access token dit
   * encore « non vérifiée ». Un refresh en émet un à jour.
   */
  async refreshAfterVerification() {
    if (useSessionStore.getState().accessToken) {
      await apiClient.refreshSession();
    }
  },
};
