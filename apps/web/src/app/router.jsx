import { createBrowserRouter } from 'react-router';
import { adminRoutes } from '../spaces/admin/routes.js';
import { checkinRoutes } from '../spaces/checkin/routes.js';
import { organizerRoutes } from '../spaces/organizer/routes.js';
import { publicRoutes } from '../spaces/public/routes.js';
import { ErrorPage } from './ErrorPage.jsx';
import { RootLayout } from './RootLayout.jsx';
import { RouteLoading } from './RouteLoading.jsx';

/**
 * Arbre des routes. Il ne contient que la structure : le code de chaque espace (mises en
 * page, pages, traductions) est dans son propre bundle, chargé par `lazy` à la première visite.
 *
 * - `/` : public et invités ;
 * - `/organisateur`, `/accueil`, `/admin` : espaces protégés, chacun avec sa page de connexion.
 *
 * @type {import('react-router').RouteObject[]}
 */
export const routes = [
  {
    id: 'root',
    path: '/',
    Component: RootLayout,
    ErrorBoundary: ErrorPage,
    HydrateFallback: RouteLoading,
    children: [publicRoutes, organizerRoutes, checkinRoutes, adminRoutes],
  },
];

/** Routeur de l'application (mode data router). */
export function createAppRouter() {
  return createBrowserRouter(routes);
}
