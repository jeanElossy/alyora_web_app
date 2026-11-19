import { cx } from './cx.js';

/**
 * Contrastes du texte sur son fond (fond teinté composé sur blanc) : tous au-dessus de 4,5:1.
 * Un badge ne porte jamais l'information par sa seule couleur : son texte la dit.
 */
const TONES = {
  neutral: 'bg-charcoal/5 text-charcoal',
  forest: 'bg-forest text-ivory',
  champagne: 'bg-champagne text-charcoal',
  success: 'bg-forest/10 text-forest',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
};

/**
 * @typedef {object} BadgeProps
 * @property {keyof typeof TONES} [tone]
 * @property {import('react').ReactNode} children Texte déjà traduit.
 * @property {string} [className]
 */

/**
 * Étiquette d'état ou de catégorie.
 *
 * @param {BadgeProps} props
 */
export function Badge({ tone = 'neutral', children, className }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
