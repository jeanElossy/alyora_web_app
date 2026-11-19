import { redirect } from 'react-router';
import { apiClient } from '../api/api-client.js';
import { useSessionStore } from './session-store.js';

/** Paramètre de la page de connexion qui porte la page demandée au départ. */
export const RETURN_PARAM = 'retour';

/**
 * Fabrique des gardes de route. Une garde est un loader React Router : elle s'exécute avant
 * le rendu, si bien qu'un espace protégé ne s'affiche jamais, même brièvement, sans session.
 *
 * Ce n'est qu'un confort d'interface : le serveur vérifie chaque permission. Le code d'un
 * espace protégé reste téléchargeable par tous et ne contient aucun secret.
 *
 * @param {object} deps
 * @param {() => string | null} deps.getAccessToken
 * @param {() => Promise<unknown>} deps.refreshSession
 * @returns {(loginPath: string) => import('react-router').LoaderFunction}
 */
export function createSessionGuard({ getAccessToken, refreshSession }) {
  return (loginPath) =>
    async ({ request }) => {
      if (getAccessToken()) {
        return null;
      }
      try {
        // Après un rechargement, l'access token en mémoire est perdu : le cookie de refresh
        // rétablit la session sans repasser par la connexion.
        await refreshSession();
        return null;
      } catch {
        const { pathname, search } = new URL(request.url);
        const params = new URLSearchParams({ [RETURN_PARAM]: `${pathname}${search}` });
        throw redirect(`${loginPath}?${params}`);
      }
    };
}

/** Garde branchée sur la session de l'application. */
export const requireSession = createSessionGuard({
  getAccessToken: () => useSessionStore.getState().accessToken,
  refreshSession: () => apiClient.refreshSession(),
});
