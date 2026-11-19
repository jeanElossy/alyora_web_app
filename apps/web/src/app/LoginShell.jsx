import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PHOTOS } from '../assets/images/index.js';

/**
 * @typedef {object} LoginShellProps
 * @property {string} documentTitle
 * @property {string} spaceName Nom de l'espace, en surtitre.
 * @property {string} title
 * @property {string} message
 */

/**
 * Coquille de la page de connexion d'un espace, sans formulaire : le module d'authentification
 * la remplacera. Écran partagé sur grand écran (panneau vert de la marque, illustration),
 * carte seule sur mobile.
 *
 * @param {LoginShellProps} props
 */
export function LoginShell({ documentTitle, spaceName, title, message }) {
  const { t } = useTranslation();

  return (
    <main className="grid min-h-dvh bg-ivory lg:grid-cols-2">
      <title>{documentTitle}</title>
      <aside className="surface-dark relative hidden overflow-hidden bg-forest text-ivory lg:block">
        <img
          src={PHOTOS.reception.src}
          srcSet={PHOTOS.reception.srcSet}
          sizes="50vw"
          width={PHOTOS.reception.width}
          height={PHOTOS.reception.height}
          alt=""
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Voile vert : le texte garde son contraste quelle que soit la photo. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-b from-forest/90 via-forest/35 to-forest"
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <p className="font-display text-2xl font-semibold tracking-[0.22em]">{t('brand')}</p>
          <p className="max-w-sm font-display text-3xl leading-snug text-champagne">
            {t('loginTagline')}
          </p>
        </div>
      </aside>
      <div className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md rounded-3xl border border-charcoal/10 bg-white p-8 shadow-[0_24px_60px_-30px_rgba(23,61,50,0.35)] sm:p-12">
          <p className="font-display text-xl font-semibold tracking-[0.22em] text-forest lg:hidden">
            {t('brand')}
          </p>
          <span aria-hidden="true" className="mt-8 block h-px w-12 bg-champagne lg:mt-0" />
          <p className="mt-8 text-xs font-medium tracking-[0.24em] text-champagne-deep uppercase">
            {spaceName}
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight font-semibold text-forest">
            {title}
          </h1>
          <p className="mt-4 leading-relaxed text-muted">{message}</p>
          <Link
            to="/"
            className="mt-10 inline-flex w-full items-center justify-center rounded-full bg-forest px-7 py-3.5 text-sm font-medium text-ivory transition-colors hover:bg-charcoal"
          >
            {t('backToPublicHome')}
          </Link>
        </div>
      </div>
    </main>
  );
}
