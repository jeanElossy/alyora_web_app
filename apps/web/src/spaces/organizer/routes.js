import { protectedSpaceRoutes } from '../../app/space-routes.js';

/**
 * Espace organisateur : préparation des mariages par l'organisateur et ses collaborateurs. Protégé par la garde de session.
 *
 * @type {import('react-router').RouteObject}
 */
export const organizerRoutes = protectedSpaceRoutes({
  path: 'organisateur',
  importer: () => import('./organizer-space.jsx'),
});
