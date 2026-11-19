import { cx } from './cx.js';
import { RingsIcon } from './icons.jsx';

/**
 * @typedef {object} EmptyStateProps
 * @property {string} title Déjà traduit.
 * @property {string} [description]
 * @property {import('react').ReactNode} [action] Action principale (un Button).
 * @property {'h2' | 'h3'} [headingLevel] Selon la place dans la page.
 * @property {string} [className]
 */

/**
 * État vide : un médaillon aux anneaux, un titre, une phrase et, au besoin, une action.
 *
 * @param {EmptyStateProps} props
 */
export function EmptyState({ title, description, action, headingLevel = 'h2', className }) {
  const Heading = headingLevel;
  return (
    <section
      className={cx(
        'flex flex-col items-center rounded-3xl border border-dashed border-charcoal/20 bg-white/70 px-6 py-14 text-center sm:py-20',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid h-16 w-16 place-items-center rounded-full border border-champagne bg-ivory"
      >
        <RingsIcon />
      </span>
      <Heading className="mt-6 font-display text-2xl font-semibold text-forest">{title}</Heading>
      {description ? (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
