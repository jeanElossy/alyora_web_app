import { cx } from './cx.js';

/**
 * @typedef {object} TableColumn
 * @property {string} key
 * @property {string} header Déjà traduit.
 * @property {'left' | 'right'} [align] À droite pour les nombres et les montants.
 */

/**
 * @typedef {object} TableRow
 * @property {string} id
 * @property {Record<string, import('react').ReactNode>} cells Contenu par clé de colonne.
 */

/**
 * @typedef {object} TableProps
 * @property {string} caption Titre du tableau, déjà traduit ; nom de la zone défilante.
 * @property {TableColumn[]} columns
 * @property {TableRow[]} rows
 * @property {string} [className]
 */

/**
 * Tableau de données. En 360 px, il défile horizontalement dans son cadre, jamais la page ; le
 * cadre est focalisable et nommé, si bien qu'on le fait défiler au clavier.
 *
 * @param {TableProps} props
 */
export function Table({ caption, columns, rows, className }) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={cx('overflow-x-auto rounded-2xl border border-charcoal/10 bg-white', className)}
    >
      <table className="w-full min-w-xl border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-charcoal/10">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cx(
                  'px-5 py-3.5 text-xs font-medium tracking-[0.12em] text-muted uppercase',
                  column.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-charcoal/5 last:border-0 hover:bg-ivory/60">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cx(
                    'px-5 py-4 text-charcoal',
                    column.align === 'right' ? 'text-right tabular-nums' : 'text-left',
                  )}
                >
                  {row.cells[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
