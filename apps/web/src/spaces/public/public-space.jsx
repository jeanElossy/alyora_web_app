// Bundle de l'espace public : mise en page, pages et traductions, chargés à la première visite.
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { ArchPhoto } from '../../app/ArchPhoto.jsx';
import { PageMessage } from '../../app/PageMessage.jsx';
import { CONTAINER, SpaceShell } from '../../app/SpaceShell.jsx';
import { PHOTOS } from '../../assets/images/index.js';
import { registerNamespace } from '../../lib/i18n/i18n.js';
import fr from './locales/fr.json';

export const NAMESPACE = 'public';

/** Les trois temps présentés sur l'accueil, dans l'ordre. */
const STEPS = /** @type {const} */ (['invite', 'confirm', 'welcome']);

registerNamespace(NAMESPACE, fr);

export function Layout() {
  const { t } = useTranslation(NAMESPACE);

  return (
    <SpaceShell
      homePath="/"
      spaceName={t('space.name')}
      navLabel={t('nav.label')}
      navItems={[
        { to: '/', label: t('nav.home'), end: true },
        { to: '/organisateur', label: t('nav.organizer') },
      ]}
    >
      <Outlet />
    </SpaceShell>
  );
}

/** Accueil public : présentation de la marque, sans aucune fonctionnalité. */
export function HomePage() {
  const { t } = useTranslation(NAMESPACE);

  return (
    <>
      <title>{t('home.documentTitle')}</title>
      <section
        className={`${CONTAINER} grid items-center gap-14 py-14 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20 lg:py-28`}
      >
        <div>
          <p className="text-xs font-medium tracking-[0.26em] text-champagne-deep uppercase">
            {t('home.eyebrow')}
          </p>
          <h1 className="mt-6 font-display text-5xl leading-[1.04] font-semibold text-forest sm:text-6xl lg:text-7xl">
            {t('home.title')}{' '}
            <span className="block text-champagne-deep">{t('home.titleAccent')}</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted">{t('home.intro')}</p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to="/organisateur"
              className="inline-flex items-center justify-center rounded-full bg-forest px-7 py-4 text-sm font-medium text-ivory transition-colors hover:bg-charcoal"
            >
              {t('home.cta')}
            </Link>
            <a
              href="#trois-temps"
              className="inline-flex items-center justify-center rounded-full border border-charcoal/15 px-7 py-4 text-sm font-medium text-forest transition-colors hover:border-forest"
            >
              {t('home.discover')}
            </a>
          </div>
        </div>
        <ArchPhoto
          photo={PHOTOS.ceremony}
          sizes="(min-width: 1024px) 26rem, (min-width: 640px) 22rem, 80vw"
          priority
          className="mx-auto w-full max-w-[18rem] sm:max-w-sm lg:max-w-md"
        />
      </section>

      <section
        id="trois-temps"
        aria-labelledby="trois-temps-titre"
        className="scroll-mt-24 border-t border-charcoal/10 bg-white/60"
      >
        <div className={`${CONTAINER} py-16 sm:py-24`}>
          <h2
            id="trois-temps-titre"
            className="max-w-xl font-display text-3xl leading-tight font-semibold text-forest sm:text-4xl"
          >
            {t('home.steps.title')}
          </h2>
          <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
            {STEPS.map((step, index) => (
              <li key={step}>
                <img
                  src={PHOTOS[step].src}
                  srcSet={PHOTOS[step].srcSet}
                  sizes="(min-width: 1152px) 22rem, (min-width: 640px) 30vw, 90vw"
                  width={PHOTOS[step].width}
                  height={PHOTOS[step].height}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/3] w-full rounded-2xl object-cover"
                />
                <div className="mt-6 flex items-baseline gap-4 border-t border-charcoal/15 pt-5">
                  <span
                    aria-hidden="true"
                    className="font-display text-3xl font-medium text-champagne-deep"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="font-display text-2xl font-semibold text-forest">
                    {t(`home.steps.${step}.title`)}
                  </h3>
                </div>
                <p className="mt-3 leading-relaxed text-muted">{t(`home.steps.${step}.text`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation(NAMESPACE);

  return (
    <PageMessage
      documentTitle={t('notFound.documentTitle')}
      numeral="404"
      title={t('notFound.title')}
      message={t('notFound.message')}
      action={{ to: '/', label: t('notFound.back') }}
    />
  );
}
