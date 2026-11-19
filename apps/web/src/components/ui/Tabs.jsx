import { Tabs as RadixTabs } from 'radix-ui';

/**
 * @typedef {object} TabItem
 * @property {string} value
 * @property {string} label Déjà traduit.
 * @property {import('react').ReactNode} content
 */

/**
 * @typedef {object} TabsProps
 * @property {string} label Nom accessible de la liste d'onglets, déjà traduit.
 * @property {TabItem[]} items
 * @property {string} [defaultValue] Premier onglet par défaut.
 */

/**
 * Onglets (primitive Radix Tabs) : un seul arrêt de tabulation sur la liste, passage d'un
 * onglet à l'autre aux flèches, panneau relié à son onglet. Même soulignement que la
 * navigation des espaces ; en 360 px, la liste défile dans son bandeau.
 *
 * @param {TabsProps} props
 */
export function Tabs({ label, items, defaultValue }) {
  return (
    <RadixTabs.Root defaultValue={defaultValue ?? items[0]?.value}>
      <RadixTabs.List
        aria-label={label}
        className="flex gap-6 overflow-x-auto border-b border-charcoal/10"
      >
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            className="-mb-px shrink-0 border-b-2 border-transparent py-3 text-sm text-muted transition-colors hover:text-forest data-[state=active]:border-forest data-[state=active]:font-medium data-[state=active]:text-forest"
          >
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content key={item.value} value={item.value} className="pt-6">
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
