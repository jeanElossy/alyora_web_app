import { Slot } from 'radix-ui';
import { cx } from './cx.js';
import { Spinner } from './Spinner.jsx';

/**
 * Contrastes du texte sur son fond : ivory / forest 10,93 ; charcoal / champagne 7,73 ;
 * white / champagne-deep 5,49 ; white / danger 6,69 ; forest / ivory 10,93.
 */
const VARIANTS = {
  primary: 'bg-forest text-ivory hover:bg-charcoal',
  secondary: 'bg-champagne text-charcoal hover:bg-champagne-deep hover:text-white',
  outline: 'border border-outline bg-transparent text-forest hover:border-forest hover:bg-white',
  ghost: 'bg-transparent text-forest hover:bg-charcoal/5',
  danger: 'bg-danger text-white hover:bg-charcoal',
};

const SIZES = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-6 text-sm',
  lg: 'h-13 px-8 text-base',
};

/**
 * @typedef {object} ButtonOwnProps
 * @property {keyof typeof VARIANTS} [variant]
 * @property {keyof typeof SIZES} [size]
 * @property {boolean} [loading] Occupé : désactivé, aria-busy, indicateur de chargement.
 * @property {boolean} [asChild] Prête son style à son unique enfant (un lien, par exemple).
 */

/** @typedef {import('react').ComponentPropsWithRef<'button'> & ButtonOwnProps} ButtonProps */

/**
 * Bouton du design system : pilule, focus visible (règle globale du thème), désactivé à 50 %.
 *
 * @param {ButtonProps} props
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  asChild = false,
  className,
  disabled,
  type,
  children,
  ...props
}) {
  const classes = cx(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className,
  );

  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
      {...props}
    >
      {loading ? <Spinner size="sm" decorative /> : null}
      {children}
    </button>
  );
}
