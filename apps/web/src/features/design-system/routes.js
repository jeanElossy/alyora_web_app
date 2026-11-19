import { ErrorPage } from '../../app/ErrorPage.jsx';
import { lazyComponent } from '../../app/space-routes.js';

/**
 * La page du design system n'existe qu'en développement, ou dans un build qui l'active
 * (VITE_ENABLE_DESIGN_SYSTEM=true, pour les tests de bout en bout). Dans le build de
 * production, la condition vaut false à la compilation : la route et son bundle disparaissent.
 */
export const DESIGN_SYSTEM_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DESIGN_SYSTEM === 'true';

/** @type {import('react-router').RouteObject} */
export const designSystemRoutes = {
  path: 'design-system',
  lazy: lazyComponent(() => import('./design-system-page.jsx'), 'DesignSystemPage'),
  ErrorBoundary: ErrorPage,
};
