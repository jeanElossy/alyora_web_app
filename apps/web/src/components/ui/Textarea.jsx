import { cx } from './cx.js';
import { CONTROL_CLASSES } from './Input.jsx';

/**
 * Champ de saisie de plusieurs lignes.
 *
 * @param {import('react').ComponentPropsWithRef<'textarea'>} props
 */
export function Textarea({ className, rows = 4, ...props }) {
  return (
    <textarea rows={rows} className={cx(CONTROL_CLASSES, 'min-h-28 py-3', className)} {...props} />
  );
}
