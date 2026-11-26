import { myPermissionsResponseSchema } from '@alyora/shared';
import { apiClient } from '../../lib/api/api-client.js';

// Appels des permissions, toujours par le client API (jamais fetch). La réponse est validée
// par son schéma partagé : une réponse inattendue est une erreur, pas une donnée.

export const permissionsApi = {
  /**
   * Rôle et permissions du compte connecté sur un événement (GET /events/:eventId/permissions/me).
   *
   * @param {string} eventId
   * @param {AbortSignal} [signal]
   * @returns {Promise<import('@alyora/shared/schemas').MyPermissionsResponse>}
   */
  async mine(eventId, signal) {
    return myPermissionsResponseSchema.parse(
      await apiClient.request(`/events/${encodeURIComponent(eventId)}/permissions/me`, { signal }),
    );
  },
};
