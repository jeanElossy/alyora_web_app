import { Avatar as RadixAvatar } from 'radix-ui';
import { cx } from './cx.js';

const SIZES = { sm: 'h-8 w-8 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-16 w-16 text-lg' };

/**
 * Initiales d'un nom : la première lettre des deux premiers mots (« Awa Koné » → « AK »).
 *
 * @param {string} name
 * @returns {string}
 */
export function initialsOf(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase('fr'))
    .join('');
}

/**
 * @typedef {object} AvatarProps
 * @property {string} name Nom de la personne : nom accessible de l'avatar.
 * @property {string} [src] Photo ; les initiales la remplacent tant qu'elle n'est pas chargée.
 * @property {keyof typeof SIZES} [size]
 * @property {string} [className]
 */

/**
 * Avatar (primitive Radix Avatar) : photo ronde, ou initiales sur fond champagne (charcoal sur
 * champagne : 7,73:1).
 *
 * @param {AvatarProps} props
 */
export function Avatar({ name, src, size = 'md', className }) {
  return (
    <RadixAvatar.Root
      role="img"
      aria-label={name}
      className={cx(
        'inline-flex shrink-0 overflow-hidden rounded-full bg-champagne align-middle ring-2 ring-white',
        SIZES[size],
        className,
      )}
    >
      {src ? <RadixAvatar.Image src={src} alt="" className="h-full w-full object-cover" /> : null}
      <RadixAvatar.Fallback
        aria-hidden="true"
        className="grid h-full w-full place-items-center font-medium text-charcoal"
      >
        {initialsOf(name)}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}
