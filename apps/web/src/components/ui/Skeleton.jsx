import { cx } from './cx.js';

/**
 * Silhouette d'un contenu en cours de chargement. Décorative : le chargement est annoncé par
 * ailleurs (un Spinner, ou aria-busy sur la zone qui se charge).
 *
 * @param {{ className?: string }} props Dimensions et forme (h-4 w-32, rounded-full...).
 */
export function Skeleton({ className }) {
  return (
    <span
      aria-hidden="true"
      className={cx('block animate-pulse rounded-lg bg-charcoal/10', className)}
    />
  );
}
