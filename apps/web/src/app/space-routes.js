import { requireSession } from '../lib/session/require-session.js';
import { ErrorPage } from './ErrorPage.jsx';

/**
 * Composants qu'un module d'espace protégé exporte.
 *
 * @typedef {object} ProtectedSpaceModule
 * @property {import('react').ComponentType} Layout Mise en page et navigation de l'espace.
 * @property {import('react').ComponentType} HomePage
 * @property {import('react').ComponentType} NotFoundPage 404 propre à l'espace.
 * @property {import('react').ComponentType} LoginPage Page de connexion de l'espace.
 */

/**
 * `lazy` de React Router qui charge un composant exporté par le module d'un espace. Tous les
 * appels d'un même espace importent le même module : Vite en fait un seul bundle par espace.
 *
 * @template {Record<string, unknown>} M
 * @param {() => Promise<M>} importer
 * @param {keyof M & string} name
 * @returns {() => Promise<{ Component: import('react').ComponentType }>}
 */
export function lazyComponent(importer, name) {
  return async () => {
    const module = await importer();
    return { Component: /** @type {import('react').ComponentType} */ (module[name]) };
  };
}

/**
 * Routes d'un espace protégé, toutes bâties de la même façon :
 * - `/<espace>/connexion` : page de connexion, accessible sans session ;
 * - tout le reste passe par la garde de session, puis par la mise en page de l'espace : son
 *   accueil, et sa page 404 pour un chemin inconnu (un visiteur sans session est redirigé vers
 *   la connexion avant d'apprendre si la page existe).
 *
 * @param {object} options
 * @param {string} options.path Segment de l'espace ("organisateur").
 * @param {() => Promise<ProtectedSpaceModule>} options.importer
 * @param {(loginPath: string) => import('react-router').LoaderFunction} [options.guard]
 * @returns {import('react-router').RouteObject}
 */
export function protectedSpaceRoutes({ path, importer, guard = requireSession }) {
  return {
    path,
    ErrorBoundary: ErrorPage,
    children: [
      { path: 'connexion', lazy: lazyComponent(importer, 'LoginPage') },
      {
        loader: guard(`/${path}/connexion`),
        lazy: lazyComponent(importer, 'Layout'),
        children: [
          { index: true, lazy: lazyComponent(importer, 'HomePage') },
          { path: '*', lazy: lazyComponent(importer, 'NotFoundPage') },
        ],
      },
    ],
  };
}
