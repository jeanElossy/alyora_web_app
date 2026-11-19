import { cx } from './cx.js';

/**
 * Apparence commune des contrôles de saisie : fond blanc, bordure `outline` (au moins 3:1),
 * texte en 16 px (pas de zoom automatique sur iOS), bordure danger quand le contrôle est
 * invalide.
 */
export const CONTROL_CLASSES =
  'w-full rounded-xl border border-outline bg-white px-4 text-base text-charcoal transition-colors placeholder:text-muted hover:border-charcoal focus:border-forest aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-ivory disabled:opacity-60';

/**
 * Champ de saisie d'une ligne. À placer dans un Field, qui lui donne son libellé.
 *
 * @param {import('react').ComponentPropsWithRef<'input'>} props
 */
export function Input({ className, ...props }) {
  return <input className={cx(CONTROL_CLASSES, 'h-12', className)} {...props} />;
}
