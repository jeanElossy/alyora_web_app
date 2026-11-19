import { Checkbox as RadixCheckbox } from 'radix-ui';
import { useId } from 'react';
import { cx } from './cx.js';
import { CheckIcon } from './icons.jsx';

/**
 * @typedef {object} CheckboxOwnProps
 * @property {string} label Texte déjà traduit, cliquable.
 * @property {string} [description]
 * @property {string} [error] Message d'erreur, déjà traduit.
 */

/**
 * @typedef {import('react').ComponentPropsWithRef<typeof RadixCheckbox.Root> & CheckboxOwnProps} CheckboxProps
 */

/**
 * Case à cocher (primitive Radix Checkbox), avec son libellé et, au besoin, sa description et
 * son erreur. Espace la coche ; la bordure `outline` reste visible (au moins 3:1).
 *
 * @param {CheckboxProps} props
 */
export function Checkbox({ label, description, error, id, className, ...props }) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;
  const descriptionId = `${checkboxId}-description`;
  const errorId = `${checkboxId}-error`;
  const describedBy =
    [description && descriptionId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx('flex items-start gap-3', className)}>
      <RadixCheckbox.Root
        id={checkboxId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-outline bg-white transition-colors hover:border-charcoal disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger data-[state=checked]:border-forest data-[state=checked]:bg-forest"
        {...props}
      >
        <RadixCheckbox.Indicator className="text-ivory">
          <CheckIcon className="h-3.5 w-3.5" />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <div className="flex flex-col gap-1">
        <label htmlFor={checkboxId} className="cursor-pointer text-sm leading-snug text-charcoal">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="text-xs text-muted">
            {description}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="text-xs font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
