import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './cx.js';

/**
 * Attributs que le champ transmet à son contrôle : identifiant (pour le libellé), description
 * (aide et erreur) et état invalide.
 *
 * @typedef {object} FieldControlProps
 * @property {string} id
 * @property {string | undefined} aria-describedby
 * @property {true | undefined} aria-invalid
 */

/**
 * @typedef {object} FieldProps
 * @property {string} label
 * @property {string} [hint] Aide affichée sous le contrôle.
 * @property {string} [error] Message d'erreur, déjà traduit.
 * @property {boolean} [required]
 * @property {string} [className]
 * @property {(control: FieldControlProps) => import('react').ReactNode} children
 */

/**
 * Charpente d'un champ de formulaire : libellé relié au contrôle, mention « obligatoire »,
 * aide et erreur annoncées par aria-describedby.
 *
 * @param {FieldProps} props
 */
export function Field({ label, hint, error, required = false, className, children }) {
  const { t } = useTranslation('ui');
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-sm font-medium text-charcoal">
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="text-danger">
              {' *'}
            </span>
            <span className="sr-only">{t('field.required')}</span>
          </>
        ) : null}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
