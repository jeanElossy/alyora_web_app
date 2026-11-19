import { CONTAINER } from '../../app/SpaceShell.jsx';

/**
 * @typedef {object} SectionProps
 * @property {string} id Ancre de la section, reprise par le sommaire.
 * @property {string} title
 * @property {string} description
 * @property {import('react').ReactNode} children
 */

/**
 * Section de la page du design system : titre, phrase d'introduction, démonstrations.
 *
 * @param {SectionProps} props
 */
export function Section({ id, title, description, children }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titre`}
      className="scroll-mt-6 border-t border-charcoal/10 py-14 sm:py-20"
    >
      <div className={CONTAINER}>
        <h2
          id={`${id}-titre`}
          className="font-display text-3xl leading-tight font-semibold text-forest sm:text-4xl"
        >
          {title}
        </h2>
        <p className="mt-3 max-w-prose text-muted">{description}</p>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

/**
 * Sous-titre d'un groupe de démonstrations dans une section.
 *
 * @param {{ children: import('react').ReactNode }} props
 */
export function DemoTitle({ children }) {
  return (
    <h3 className="mb-4 text-xs font-medium tracking-[0.2em] text-champagne-deep uppercase">
      {children}
    </h3>
  );
}
