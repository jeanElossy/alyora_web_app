import { useTranslation } from 'react-i18next';
import { cx } from './cx.js';

const SIZES = { sm: 'h-4 w-4 border-2', md: 'h-6 w-6 border-2', lg: 'h-10 w-10 border-[3px]' };

/**
 * @typedef {object} SpinnerProps
 * @property {keyof typeof SIZES} [size]
 * @property {string} [label] Annonce aux lecteurs d'écran, « Chargement en cours… » par défaut.
 * @property {boolean} [decorative] Dans un composant qui annonce déjà son état (bouton occupé).
 * @property {string} [className]
 */

/**
 * Indicateur de chargement. Annoncé aux lecteurs d'écran (role="status"), sauf s'il est
 * décoratif. Avec les mouvements réduits, il ne tourne plus.
 *
 * @param {SpinnerProps} props
 */
export function Spinner({ size = 'md', label, decorative = false, className }) {
  const { t } = useTranslation('ui');
  const ring = (
    <span
      aria-hidden="true"
      className={cx(
        'inline-block animate-spin rounded-full border-current border-t-transparent',
        SIZES[size],
        className,
      )}
    />
  );
  if (decorative) {
    return ring;
  }
  return (
    <span role="status" className="inline-flex items-center text-forest">
      {ring}
      <span className="sr-only">{label ?? t('spinner.label')}</span>
    </span>
  );
}
