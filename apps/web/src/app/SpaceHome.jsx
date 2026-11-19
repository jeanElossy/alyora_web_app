import { CONTAINER } from './SpaceShell.jsx';

/**
 * @typedef {object} SpaceHomeProps
 * @property {string} documentTitle
 * @property {string} eyebrow Nom de l'espace, en surtitre.
 * @property {string} title
 * @property {string} intro
 * @property {string} emptyTitle Titre du panneau, tant que l'espace n'a pas d'outil.
 * @property {string} emptyMessage
 */

/**
 * Accueil d'un espace protégé, en attendant ses outils : un en-tête de tableau de bord et un
 * panneau vide soigné. Tous les textes arrivent traduits.
 *
 * @param {SpaceHomeProps} props
 */
export function SpaceHome({ documentTitle, eyebrow, title, intro, emptyTitle, emptyMessage }) {
  return (
    <div className={`${CONTAINER} py-12 sm:py-20`}>
      <title>{documentTitle}</title>
      <p className="text-xs font-medium tracking-[0.24em] text-champagne-deep uppercase">
        {eyebrow}
      </p>
      <h1 className="mt-3 font-display text-4xl leading-tight font-semibold text-forest sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-prose leading-relaxed text-muted sm:text-lg">{intro}</p>

      <section className="mt-12 flex flex-col items-center rounded-3xl border border-dashed border-charcoal/20 bg-white/70 px-6 py-16 text-center sm:py-20">
        <span
          aria-hidden="true"
          className="grid h-16 w-16 place-items-center rounded-full border border-champagne bg-ivory"
        >
          <svg viewBox="0 0 48 48" className="h-10 w-10" fill="none">
            <circle cx="19" cy="24" r="11" className="stroke-forest" strokeWidth="1.75" />
            <circle cx="29" cy="24" r="11" className="stroke-champagne" strokeWidth="1.75" />
          </svg>
        </span>
        <h2 className="mt-6 font-display text-2xl font-semibold text-forest">{emptyTitle}</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{emptyMessage}</p>
      </section>
    </div>
  );
}
