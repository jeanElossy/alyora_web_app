import { requireSession } from '../lib/session/require-session.js';
import { ErrorPage } from './ErrorPage.jsx';

/**
 * Composants qu'un module d'espace protégé exporte.
 *
 * @typedef {object} ProtectedSpaceModule
 * @property {import('react').ComponentType} Layout Mise en page et navigation de l'espace.
 * @property {import('react').ComponentType} HomePage
 * @property {import('react').ComponentType} NotFoundPage 404 propre à l'espace.
 */

/** Espaces protégés, par leur clé (espace de noms i18next) : organizer, checkin, admin. */
/** @typedef {'organizer' | 'checkin' | 'admin'} ProtectedSpaceKey */

/**
 * Données de route lues par les pages du compte (connexion, profil, sécurité) : à quel espace
 * elles appartiennent.
 *
 * @typedef {object} SpaceHandle
 * @property {ProtectedSpaceKey} space
 * @property {string} home Accueil de l'espace (« /organisateur »).
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

/** Pages du compte : un seul bundle, partagé par tous les espaces. */
const authPages = () => import('../features/auth/auth-pages.jsx');

/**
 * Routes d'un espace protégé, toutes bâties de la même façon :
 * - `/<espace>/connexion` : page de connexion, accessible sans session ;
 * - tout le reste passe par la garde de session, puis par la mise en page de l'espace : son
 *   accueil, le profil et la sécurité du compte, et sa page 404 pour un chemin inconnu (un
 *   visiteur sans session est redirigé vers la connexion avant d'apprendre si la page existe).
 *
 * @param {object} options
 * @param {string} options.path Segment de l'espace ("organisateur").
 * @param {ProtectedSpaceKey} options.space
 * @param {() => Promise<ProtectedSpaceModule>} options.importer
 * @param {(loginPath: string) => import('react-router').LoaderFunction} [options.guard]
 * @returns {import('react-router').RouteObject}
 */
export function protectedSpaceRoutes({ path, space, importer, guard = requireSession }) {
  /** @type {SpaceHandle} */
  const handle = { space, home: `/${path}` };
  return {
    path,
    ErrorBoundary: ErrorPage,
    children: [
      { path: 'connexion', handle, lazy: lazyComponent(authPages, 'LoginPage') },
      {
        loader: guard(`/${path}/connexion`),
        lazy: lazyComponent(importer, 'Layout'),
        children: [
          { index: true, lazy: lazyComponent(importer, 'HomePage') },
          { path: 'profil', handle, lazy: lazyComponent(authPages, 'ProfilePage') },
          { path: 'securite', handle, lazy: lazyComponent(authPages, 'SecurityPage') },
          { path: '*', lazy: lazyComponent(importer, 'NotFoundPage') },
        ],
      },
    ],
  };
}

/**
 * Pages publiques du compte (inscription, vérification de l'adresse, mot de passe), hors de
 * tout espace : leurs adresses sont celles des liens envoyés par e-mail (AUTH_WEB_PATHS).
 *
 * @type {import('react-router').RouteObject[]}
 */
export const publicAccountRoutes = [
  { path: 'inscription', lazy: lazyComponent(authPages, 'RegisterPage') },
  { path: 'verifier-email', lazy: lazyComponent(authPages, 'VerifyEmailPage') },
  { path: 'mot-de-passe-oublie', lazy: lazyComponent(authPages, 'ForgotPasswordPage') },
  { path: 'reinitialiser-mot-de-passe', lazy: lazyComponent(authPages, 'ResetPasswordPage') },
].map((route) => ({ ...route, ErrorBoundary: ErrorPage }));
