import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router';
import { BRAND } from '../assets/brand/index.js';

/** Largeur et marges du contenu, communes à l'en-tête, aux pages et au pied de page. */
export const CONTAINER = 'mx-auto w-full max-w-6xl px-5 sm:px-8';

/**
 * @typedef {object} NavItem
 * @property {string} to
 * @property {string} label Texte déjà traduit.
 * @property {boolean} [end] Actif seulement sur ce chemin exact (lien d'accueil d'un espace).
 */

/**
 * @typedef {object} SpaceShellProps
 * @property {string} homePath Accueil de l'espace.
 * @property {string} spaceName Nom de l'espace, déjà traduit.
 * @property {string} navLabel Nom accessible de la navigation, déjà traduit.
 * @property {NavItem[]} navItems
 * @property {import('react').ReactNode} [actions] Actions de l'en-tête (déconnexion).
 * @property {import('react').ReactNode} children
 */

/**
 * Charpente commune des mises en page d'espace, moderne et sobre :
 * - en-tête clair, translucide et collant, séparé du contenu par un filet ;
 * - marque en capitales espacées, navigation en liens discrets (l'actif est souligné et porte
 *   aria-current), nom de l'espace en petites capitales ;
 * - pied de page léger.
 * En 360 px, la navigation passe sous la marque et défile dans son bandeau, jamais la page.
 * Les pages gèrent leur propre largeur (CONTAINER), pour pouvoir peindre des bandeaux pleins.
 *
 * @param {SpaceShellProps} props
 */
export function SpaceShell({ homePath, spaceName, navLabel, navItems, actions, children }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh flex-col bg-ivory text-charcoal">
      <a
        href="#contenu"
        className="sr-only z-50 rounded-full bg-white px-5 py-2 text-sm text-forest shadow-sm focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('skipToContent')}
      </a>
      <header className="sticky top-0 z-40 border-b border-charcoal/10 bg-ivory/85 backdrop-blur-md">
        <div className={`${CONTAINER} flex flex-wrap items-center gap-x-10`}>
          <Link
            to={homePath}
            className="group flex items-center gap-3 py-3 font-display text-2xl font-semibold tracking-[0.22em] text-forest"
          >
            {/* Emblème décoratif : le nom, juste après, nomme le lien. */}
            <img
              src={BRAND.emblem.src}
              srcSet={BRAND.emblem.srcSet}
              width={BRAND.emblem.width}
              height={BRAND.emblem.height}
              alt=""
              decoding="async"
              className="h-9 w-auto transition-transform duration-500 group-hover:-rotate-3 group-hover:scale-105"
            />
            {t('brand')}
          </Link>
          {/* Masqué en 360 px : la page le reprend en surtitre, et l'en-tête reste sur deux lignes. */}
          <span className="ml-auto hidden truncate text-[0.7rem] tracking-[0.22em] text-muted uppercase sm:order-last sm:block">
            {spaceName}
          </span>
          {actions ? <div className="ml-auto py-3 sm:order-last sm:ml-0">{actions}</div> : null}
          <nav aria-label={navLabel} className="order-last w-full sm:order-none sm:w-auto">
            <ul className="-mb-px flex gap-7 overflow-x-auto">
              {navItems.map((item) => (
                <li key={item.to} className="shrink-0">
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `block border-b-2 py-3 text-sm transition-colors sm:py-6 ${
                        isActive
                          ? 'border-forest font-medium text-forest'
                          : 'border-transparent text-muted hover:text-forest'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main id="contenu" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <footer className="border-t border-charcoal/10">
        <div
          className={`${CONTAINER} flex flex-col gap-2 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between`}
        >
          <span className="flex items-center gap-2 font-display text-lg font-semibold tracking-[0.22em] text-forest">
            <img
              src={BRAND.emblem.src}
              srcSet={BRAND.emblem.srcSet}
              width={BRAND.emblem.width}
              height={BRAND.emblem.height}
              alt=""
              decoding="async"
              className="h-7 w-auto"
            />
            {t('brand')}
          </span>
          <span>{t('footer', { year: new Date().getFullYear() })}</span>
        </div>
      </footer>
    </div>
  );
}
