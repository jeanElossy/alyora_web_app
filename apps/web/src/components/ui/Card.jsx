import { cx } from './cx.js';

/**
 * @typedef {object} CardProps
 * @property {string} [title] Déjà traduit ; titre de niveau 3.
 * @property {string} [description]
 * @property {import('react').ReactNode} [footer]
 * @property {import('react').ReactNode} [children]
 * @property {string} [className]
 */

/**
 * Surface blanche aux angles très arrondis, séparée du fond par un filet léger.
 *
 * @param {CardProps} props
 */
export function Card({ title, description, footer, children, className }) {
  return (
    <section
      className={cx(
        'flex flex-col rounded-3xl border border-charcoal/10 bg-white p-6 shadow-[0_1px_2px_rgba(41,39,35,0.04)] sm:p-8',
        className,
      )}
    >
      {title ? (
        <h3 className="font-display text-2xl leading-tight font-semibold text-forest">{title}</h3>
      ) : null}
      {description ? (
        <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
      ) : null}
      {children ? <div className={title || description ? 'mt-5' : ''}>{children}</div> : null}
      {footer ? (
        <div className="mt-6 flex flex-wrap gap-3 border-t border-charcoal/10 pt-5">{footer}</div>
      ) : null}
    </section>
  );
}
