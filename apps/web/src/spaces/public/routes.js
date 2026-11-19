import { ErrorPage } from '../../app/ErrorPage.jsx';
import { lazyComponent } from '../../app/space-routes.js';

const importer = () => import('./public-space.jsx');

/**
 * Espace public (et invités), à la racine. Sans garde : tout le monde y accède.
 *
 * @type {import('react-router').RouteObject}
 */
export const publicRoutes = {
  id: 'public',
  lazy: lazyComponent(importer, 'Layout'),
  ErrorBoundary: ErrorPage,
  children: [
    { index: true, lazy: lazyComponent(importer, 'HomePage') },
    { path: '*', lazy: lazyComponent(importer, 'NotFoundPage') },
  ],
};
