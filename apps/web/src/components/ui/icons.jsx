// Icônes du design system : traits fins, couleur héritée du texte, toujours décoratives (le
// composant qui les porte fournit le nom accessible).

/** @typedef {{ className?: string }} IconProps */

/** @param {IconProps} props */
export function CheckIcon({ className = 'h-4 w-4' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** @param {IconProps} props */
export function CloseIcon({ className = 'h-5 w-5' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M5 5l10 10M15 5L5 15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** @param {IconProps & { direction?: 'down' | 'left' | 'right' }} props */
export function ChevronIcon({ className = 'h-4 w-4', direction = 'down' }) {
  const rotation = { down: '', left: 'rotate-90', right: '-rotate-90' }[direction];
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={`${className} ${rotation}`}>
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Deux anneaux entrelacés, le motif de la marque. @param {IconProps} props */
export function RingsIcon({ className = 'h-10 w-10' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className={className}>
      <circle cx="19" cy="24" r="11" className="stroke-forest" strokeWidth="1.75" />
      <circle cx="29" cy="24" r="11" className="stroke-champagne" strokeWidth="1.75" />
    </svg>
  );
}
