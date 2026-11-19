import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PHOTOS } from '../../../assets/images/index.js';
import { NAMESPACE } from '../namespace.js';

/**
 * @typedef {object} AuthLayoutProps
 * @property {string} documentTitle
 * @property {string} eyebrow Surtitre (espace, étape).
 * @property {string} title
 * @property {string} [intro]
 * @property {import('react').ReactNode} children Formulaire ou message.
 * @property {import('react').ReactNode} [footer] Liens sous la carte.
 */

/**
 * Mise en page des pages du compte : écran partagé sur grand écran (photo de réception sous un
 * voile vert, phrase de la marque), carte seule sur mobile. Tous les textes arrivent traduits.
 *
 * @param {AuthLayoutProps} props
 */
export function AuthLayout({ documentTitle, eyebrow, title, intro, children, footer }) {
  const { t } = useTranslation(NAMESPACE);

  return (
    <main className="grid min-h-dvh bg-ivory lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
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
          className="absolute inset-0 bg-linear-to-b from-forest/90 via-forest/40 to-forest"
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link
            to="/"
            className="w-fit font-display text-2xl font-semibold tracking-[0.22em] text-ivory"
          >
            {t('brand', { ns: 'common' })}
          </Link>
          <div className="max-w-md">
            <span aria-hidden="true" className="block h-px w-12 bg-champagne" />
            <p className="mt-6 font-display text-3xl leading-snug text-champagne">
              {t('layout.tagline')}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-ivory/80">{t('layout.promise')}</p>
          </div>
        </div>
      </aside>
      <div className="flex flex-col items-center justify-center px-5 py-10 sm:px-8 sm:py-16">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="block font-display text-xl font-semibold tracking-[0.22em] text-forest lg:hidden"
          >
            {t('brand', { ns: 'common' })}
          </Link>
          <div className="mt-8 rounded-3xl border border-charcoal/10 bg-white p-6 shadow-[0_24px_60px_-30px_rgba(23,61,50,0.35)] sm:p-10 lg:mt-0">
            <p className="text-xs font-medium tracking-[0.24em] text-champagne-deep uppercase">
              {eyebrow}
            </p>
            <h1 className="mt-3 font-display text-3xl leading-tight font-semibold text-forest sm:text-4xl">
              {title}
            </h1>
            {intro ? <p className="mt-3 leading-relaxed text-muted">{intro}</p> : null}
            <div className="mt-8">{children}</div>
          </div>
          {footer ? (
            <div className="mt-6 flex flex-col items-center gap-2 text-center text-sm text-muted">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
