import { useMatches } from 'react-router';

/**
 * Espace de la page du compte (connexion, profil, sécurité), porté par sa route : voir
 * protectedSpaceRoutes. L'espace organisateur par défaut.
 *
 * @returns {import('../../app/space-routes.js').SpaceHandle}
 */
export function useSpaceHandle() {
  const matches = useMatches();
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const handle = /** @type {{ space?: unknown, home?: unknown } | undefined} */ (
      matches[index]?.handle
    );
    if (handle && typeof handle.space === 'string' && typeof handle.home === 'string') {
      return /** @type {import('../../app/space-routes.js').SpaceHandle} */ (handle);
    }
  }
  return { space: 'organizer', home: '/organisateur' };
}
