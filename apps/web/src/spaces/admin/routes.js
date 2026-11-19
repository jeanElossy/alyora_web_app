import { protectedSpaceRoutes } from '../../app/space-routes.js';

/**
 * Espace d'administration de la plateforme, réservé à l'équipe ALYORA. Protégé par la garde de session.
 *
 * @type {import('react-router').RouteObject}
 */
export const adminRoutes = protectedSpaceRoutes({
  path: 'admin',
  importer: () => import('./admin-space.jsx'),
});
