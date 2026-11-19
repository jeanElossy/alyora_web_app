import { Tooltip as RadixTooltip } from 'radix-ui';

/**
 * @typedef {object} TooltipProps
 * @property {string} content Texte de l'infobulle, déjà traduit.
 * @property {import('react').ReactElement} children Déclencheur focalisable (un Button).
 * @property {'top' | 'right' | 'bottom' | 'left'} [side]
 */

/**
 * Infobulle (primitive Radix Tooltip) : affichée au survol et au focus clavier, fermée par
 * Échap, et liée au déclencheur (aria-describedby). Elle ne s'ouvre pas au toucher : elle ne
 * doit jamais porter seule une information indispensable.
 *
 * @param {TooltipProps} props
 */
export function Tooltip({ content, children, side = 'top' }) {
  return (
    <RadixTooltip.Provider delayDuration={200}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={8}
            className="z-50 max-w-xs rounded-lg bg-charcoal px-3 py-2 text-xs leading-snug text-ivory shadow-lg data-[state=delayed-open]:animate-fade-in"
          >
            {content}
            <RadixTooltip.Arrow className="fill-charcoal" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
