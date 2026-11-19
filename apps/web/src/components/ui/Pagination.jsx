import { useTranslation } from 'react-i18next';
import { Button } from './Button.jsx';
import { ChevronIcon } from './icons.jsx';

/**
 * @typedef {object} PaginationProps
 * @property {boolean} hasPrevious
 * @property {boolean} hasNext
 * @property {() => void} onPrevious
 * @property {() => void} onNext
 * @property {string} [summary] Position, déjà traduite (« 21 à 40 sur 312 ») ; annoncée.
 * @property {string} [label] Nom accessible, « Pagination » par défaut.
 */

/**
 * Pagination par curseur (page précédente, page suivante), conforme à la règle du projet :
 * au-delà de 200 documents, l'API pagine par curseur, pas par numéro de page.
 *
 * @param {PaginationProps} props
 */
export function Pagination({ hasPrevious, hasNext, onPrevious, onNext, summary, label }) {
  const { t } = useTranslation('ui');

  return (
    <nav
      aria-label={label ?? t('pagination.label')}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <Button variant="outline" size="sm" onClick={onPrevious} disabled={!hasPrevious}>
        <ChevronIcon direction="left" />
        {t('pagination.previous')}
      </Button>
      {summary ? (
        <p
          aria-live="polite"
          className="order-first w-full text-center text-sm text-muted tabular-nums sm:order-none sm:w-auto"
        >
          {summary}
        </p>
      ) : null}
      <Button variant="outline" size="sm" onClick={onNext} disabled={!hasNext}>
        {t('pagination.next')}
        <ChevronIcon direction="right" />
      </Button>
    </nav>
  );
}
