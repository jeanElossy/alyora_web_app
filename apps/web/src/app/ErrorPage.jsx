import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { isApiError } from '../lib/api/api-error.js';

/**
 * @typedef {object} ErrorView
 * @property {string} titleKey
 * @property {string} messageKey
 * @property {string} [requestId]
 */

/**
 * Choisit ce que la page d'erreur affiche. Seuls des textes traduits et, pour une erreur de
 * l'API, l'identifiant de corrélation (utile au support, sans valeur pour un attaquant) : ni
 * message d'erreur, ni pile, ni nom de fichier, ni statut technique.
 *
 * @param {unknown} error
 * @returns {ErrorView}
 */
export function describeError(error) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return { titleKey: 'errorPage.notFoundTitle', messageKey: 'errors.NOT_FOUND' };
  }
  if (isApiError(error)) {
    return {
      titleKey: 'errorPage.title',
      messageKey: `errors.${error.code}`,
      requestId: error.requestId,
    };
  }
  return { titleKey: 'errorPage.title', messageKey: 'errors.INTERNAL_ERROR' };
}

/**
 * Frontière d'erreur de React Router : à la racine (erreur globale) et sur chaque espace
 * (erreur d'une route). Elle remplace la route qui a échoué, le reste de l'application tient.
 */
export function ErrorPage() {
  const error = useRouteError();
  const { t } = useTranslation();
  const view = describeError(error);

  return (
    <main className="grid min-h-dvh place-items-center bg-ivory px-5 py-12">
      <title>{t('errorPage.documentTitle')}</title>
      <div role="alert" className="w-full max-w-md text-center">
        <span aria-hidden="true" className="mx-auto block h-px w-12 bg-champagne" />
        <h1 className="mt-6 font-display text-4xl leading-tight font-semibold text-forest">
          {t(view.titleKey)}
        </h1>
        <p className="mt-4 leading-relaxed text-muted">{t(view.messageKey)}</p>
        {view.requestId ? (
          <p className="mt-6 text-xs break-all text-muted">
            {t('errorPage.reference', { requestId: view.requestId })}
          </p>
        ) : null}
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href="/"
            className="rounded-full bg-forest px-6 py-3 text-sm font-medium text-ivory transition-colors hover:bg-charcoal"
          >
            {t('errorPage.home')}
          </a>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border border-charcoal/15 px-6 py-3 text-sm font-medium text-forest transition-colors hover:border-forest"
          >
            {t('errorPage.retry')}
          </button>
        </div>
      </div>
    </main>
  );
}
