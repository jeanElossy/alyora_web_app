import { EmptyState } from '../components/ui/EmptyState.jsx';
import { CONTAINER } from './SpaceShell.jsx';

/**
 * @typedef {object} SpaceHomeProps
 * @property {string} documentTitle
 * @property {string} eyebrow Nom de l'espace, en surtitre.
 * @property {string} title
 * @property {string} intro
 * @property {string} emptyTitle Titre de l'état vide, tant que l'espace n'a pas d'outil.
 * @property {string} emptyMessage
 */

/**
 * Accueil d'un espace protégé, en attendant ses outils : un en-tête de tableau de bord et un
 * état vide du design system. Tous les textes arrivent traduits.
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
      <EmptyState className="mt-12" title={emptyTitle} description={emptyMessage} />
    </div>
  );
}
