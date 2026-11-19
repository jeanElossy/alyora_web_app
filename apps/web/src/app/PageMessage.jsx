import { Link } from 'react-router';
import { CONTAINER } from './SpaceShell.jsx';

/**
 * @typedef {object} PageMessageProps
 * @property {string} documentTitle Titre de l'onglet, déjà traduit.
 * @property {string} title
 * @property {string} message
 * @property {string} [eyebrow] Surtitre en petites capitales.
 * @property {string} [numeral] Grand numéral décoratif (« 404 »), masqué aux lecteurs d'écran.
 * @property {{ to: string, label: string }} [action] Lien principal de la page.
 */

/**
 * Page faite d'un titre, d'un texte et d'un lien (page 404 d'un espace...). Tous les textes
 * arrivent traduits.
 *
 * @param {PageMessageProps} props
 */
export function PageMessage({ documentTitle, title, message, eyebrow, numeral, action }) {
  return (
    <section className={`${CONTAINER} py-16 sm:py-28`}>
      <title>{documentTitle}</title>
      <div className="max-w-2xl animate-rise">
        {numeral ? (
          <p
            aria-hidden="true"
            className="font-display text-8xl leading-none font-medium text-champagne sm:text-9xl"
          >
            {numeral}
          </p>
        ) : (
          <span aria-hidden="true" className="block h-px w-12 bg-champagne" />
        )}
        {eyebrow ? (
          <p className="mt-8 text-xs font-medium tracking-[0.24em] text-champagne-deep uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className={`${eyebrow ? 'mt-3' : 'mt-6'} font-display text-4xl leading-tight font-semibold text-forest sm:text-5xl`}
        >
          {title}
        </h1>
        <p className="mt-5 max-w-prose text-base leading-relaxed text-muted sm:text-lg">
          {message}
        </p>
        {action ? (
          <Link
            to={action.to}
            className="mt-10 inline-flex items-center rounded-full bg-forest px-7 py-3.5 text-sm font-medium text-ivory transition-colors hover:bg-charcoal"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
