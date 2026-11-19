import { Select as RadixSelect } from 'radix-ui';
import { cx } from './cx.js';
import { CheckIcon, ChevronIcon } from './icons.jsx';
import { CONTROL_CLASSES } from './Input.jsx';

/**
 * @typedef {object} SelectOption
 * @property {string} value
 * @property {string} label Texte déjà traduit.
 * @property {boolean} [disabled]
 */

/**
 * @typedef {object} SelectProps
 * @property {SelectOption[]} options
 * @property {string} placeholder Texte affiché sans valeur, déjà traduit.
 * @property {string} [value]
 * @property {string} [defaultValue]
 * @property {(value: string) => void} [onValueChange]
 * @property {string} [id] Fourni par Field, pour le libellé.
 * @property {string} [name] Nom envoyé avec le formulaire.
 * @property {boolean} [disabled]
 * @property {boolean} [required]
 * @property {string} [aria-describedby]
 * @property {boolean} [aria-invalid]
 * @property {() => void} [onBlur]
 * @property {string} [className]
 */

/**
 * Liste déroulante (primitive Radix Select) : ouverture au clavier (Entrée, Espace, flèches),
 * recherche par saisie, fermeture par Échap, valeur annoncée aux lecteurs d'écran.
 *
 * @param {SelectProps} props
 */
export function Select({
  options,
  placeholder,
  id,
  className,
  onBlur,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...rootProps
}) {
  return (
    <RadixSelect.Root {...rootProps}>
      <RadixSelect.Trigger
        id={id}
        onBlur={onBlur}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className={cx(
          CONTROL_CLASSES,
          'flex h-12 items-center justify-between gap-3 text-left data-placeholder:text-muted',
          className,
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon className="text-muted">
          <ChevronIcon />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-(--radix-select-content-available-height) w-(--radix-select-trigger-width) min-w-40 overflow-hidden rounded-xl border border-charcoal/10 bg-white shadow-xl data-[state=open]:animate-fade-in"
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex cursor-pointer items-center rounded-lg py-2.5 pr-3 pl-9 text-sm text-charcoal outline-none select-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-highlighted:bg-ivory data-highlighted:text-forest data-[state=checked]:font-medium"
              >
                <RadixSelect.ItemIndicator className="absolute left-3 text-forest">
                  <CheckIcon />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
