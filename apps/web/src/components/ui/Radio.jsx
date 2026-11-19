import { RadioGroup as RadixRadioGroup } from 'radix-ui';
import { useId } from 'react';
import { cx } from './cx.js';

/**
 * @typedef {object} RadioOption
 * @property {string} value
 * @property {string} label Texte déjà traduit.
 * @property {boolean} [disabled]
 */

/**
 * @typedef {object} RadioGroupOwnProps
 * @property {string} legend Question posée par le groupe, déjà traduite.
 * @property {RadioOption[]} options
 * @property {string} [error] Message d'erreur, déjà traduit.
 */

/**
 * @typedef {Omit<import('react').ComponentPropsWithoutRef<typeof RadixRadioGroup.Root>, 'children'> & RadioGroupOwnProps} RadioGroupProps
 */

/**
 * Groupe de boutons radio (primitive Radix RadioGroup) : un seul arrêt de tabulation, choix
 * aux flèches, légende reliée au groupe.
 *
 * @param {RadioGroupProps} props
 */
export function RadioGroup({ legend, options, error, className, ...props }) {
  const id = useId();
  const legendId = `${id}-legend`;
  const errorId = `${id}-error`;

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <p id={legendId} className="text-sm font-medium text-charcoal">
        {legend}
      </p>
      <RadixRadioGroup.Root
        aria-labelledby={legendId}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-6"
        {...props}
      >
        {options.map((option) => {
          const itemId = `${id}-${option.value}`;
          return (
            <div key={option.value} className="flex items-center gap-3">
              <RadixRadioGroup.Item
                id={itemId}
                value={option.value}
                disabled={option.disabled}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-outline bg-white transition-colors hover:border-charcoal disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-forest"
              >
                <RadixRadioGroup.Indicator className="block h-2.5 w-2.5 rounded-full bg-forest" />
              </RadixRadioGroup.Item>
              <label htmlFor={itemId} className="cursor-pointer text-sm text-charcoal">
                {option.label}
              </label>
            </div>
          );
        })}
      </RadixRadioGroup.Root>
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
