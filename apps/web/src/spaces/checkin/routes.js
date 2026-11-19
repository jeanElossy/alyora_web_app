import { protectedSpaceRoutes } from '../../app/space-routes.js';

/**
 * Espace accueil : contrôle des invités à l'entrée du mariage, le jour J. Protégé par la garde de session.
 *
 * @type {import('react-router').RouteObject}
 */
export const checkinRoutes = protectedSpaceRoutes({
  path: 'accueil',
  importer: () => import('./checkin-space.jsx'),
});
