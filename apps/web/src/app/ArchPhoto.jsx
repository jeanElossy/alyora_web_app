/**
 * @typedef {object} ArchPhotoProps
 * @property {import('../assets/images/index.js').Photo} photo
 * @property {string} sizes Largeur affichée selon l'écran, pour le choix de la version.
 * @property {boolean} [priority] Image visible au chargement : téléchargée en premier.
 * @property {string} [className]
 */

/**
 * Photo encadrée en arche (motif des cérémonies) : une arche champagne décalée en fond, un
 * filet doré intérieur et un médaillon aux anneaux entrelacés. Décorative : texte alternatif
 * vide, la page dit déjà tout.
 *
 * @param {ArchPhotoProps} props
 */
export function ArchPhoto({ photo, sizes, priority = false, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <span
        aria-hidden="true"
        className="absolute top-10 -right-3 bottom-0 left-8 rounded-t-full bg-champagne/35 sm:-right-5"
      />
      <img
        src={photo.src}
        srcSet={photo.srcSet}
        sizes={sizes}
        width={photo.width}
        height={photo.height}
        alt=""
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        className="relative aspect-[4/5] w-full rounded-t-full object-cover shadow-[0_40px_80px_-40px_rgba(23,61,50,0.55)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-3 rounded-t-full border border-champagne/80"
      />
      <span
        aria-hidden="true"
        className="absolute -bottom-6 -left-3 grid h-20 w-20 place-items-center rounded-full bg-forest shadow-lg ring-4 ring-ivory sm:h-24 sm:w-24"
      >
        <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none">
          <circle cx="19" cy="24" r="11" className="stroke-champagne" strokeWidth="1.75" />
          <circle cx="29" cy="24" r="11" className="stroke-ivory" strokeWidth="1.75" />
        </svg>
      </span>
    </div>
  );
}
