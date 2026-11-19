import { toApiError } from './api-error.js';
import { createSingleFlight } from './refresh-queue.js';

/**
 * Jeton CSRF de l'application, gardé en mémoire seulement (jamais dans localStorage). Obtenu
 * auprès de l'API au premier besoin, une seule fois même pour plusieurs requêtes simultanées.
 * L'API rend le même jeton à tous les onglets du navigateur (celui de son cookie) : un onglet
 * qui en demande un n'invalide pas les autres.
 *
 * @param {{ fetchToken: () => Promise<string> }} deps Appelle GET /auth/csrf.
 */
export function createCsrfToken({ fetchToken }) {
  /** @type {string | null} */
  let token = null;

  const load = createSingleFlight(async () => {
    token = await fetchToken();
    return token;
  });

  /** @returns {Promise<string>} */
  const current = async () => token ?? load();

  return {
    current,

    /** Oublie le jeton, refusé par l'API : le prochain appel en redemande un. */
    reset() {
      token = null;
    },

    /**
     * Envoie une requête qui modifie l'état avec le jeton ; si l'API le refuse (cookie expiré,
     * navigateur redémarré), en redemande un et rejoue une fois.
     *
     * @param {(csrfToken: string) => Promise<Response>} sendWith
     * @returns {Promise<Response>}
     */
    async sendWith(sendWith) {
      const response = await sendWith(await current());
      if (response.status !== 403) {
        return response;
      }
      const rejection = await toApiError(response.clone());
      if (rejection.code !== 'CSRF_INVALID') {
        return response;
      }
      token = null;
      return sendWith(await current());
    },
  };
}

/** @typedef {ReturnType<typeof createCsrfToken>} CsrfToken */
