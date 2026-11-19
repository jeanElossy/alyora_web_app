import { useTranslation } from 'react-i18next';
import { NAMESPACE } from '../namespace.js';
import { DemoTitle, Section } from '../Section.jsx';

/**
 * Couleurs de la charte et contraste de chacune sur ivoire (calculés, voir l'ADR 0003). Sans
 * ratio : décorative (champagne) ou couleur de fond (ivoire).
 */
const SWATCHES = [
  { key: 'forest', className: 'bg-forest', hex: '#173D32', ratio: '10,93' },
  { key: 'charcoal', className: 'bg-charcoal', hex: '#292723', ratio: '13,58' },
  { key: 'champagne', className: 'bg-champagne', hex: '#D5B77B', note: 'decorative' },
  { key: 'champagneDeep', className: 'bg-champagne-deep', hex: '#786745', ratio: '5,00' },
  { key: 'ivory', className: 'bg-ivory', hex: '#F8F4EB', note: 'background' },
  { key: 'muted', className: 'bg-muted', hex: '#5F5A51', ratio: '6,24' },
  { key: 'outline', className: 'bg-outline', hex: '#857F76', ratio: '3,61' },
  { key: 'danger', className: 'bg-danger', hex: '#A8321F', ratio: '6,09' },
  { key: 'warning', className: 'bg-warning', hex: '#8A5A00', ratio: '5,40' },
];

export function FoundationsSection() {
  const { t } = useTranslation(NAMESPACE);

  return (
    <Section
      id="foundations"
      title={t('sections.foundations.title')}
      description={t('sections.foundations.description')}
    >
      <DemoTitle>{t('colors.title')}</DemoTitle>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {SWATCHES.map((swatch) => (
          <li key={swatch.key} className="rounded-2xl border border-charcoal/10 bg-white p-3">
            <span
              aria-hidden="true"
              className={`block h-16 rounded-xl ring-1 ring-charcoal/10 ring-inset ${swatch.className}`}
            />
            <p className="mt-3 text-sm font-medium text-charcoal">{t(`colors.${swatch.key}`)}</p>
            <p className="text-xs text-muted tabular-nums">{swatch.hex}</p>
            <p className="mt-1 text-xs text-muted">
              {swatch.ratio
                ? t('colors.contrast', { ratio: swatch.ratio })
                : t(`colors.${swatch.note}`)}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-12">
        <DemoTitle>{t('typography.title')}</DemoTitle>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-charcoal/10 bg-white p-6 sm:p-8">
            <p className="text-xs text-muted">{t('typography.display')}</p>
            <p className="mt-4 font-display text-4xl leading-tight font-semibold text-forest">
              {t('typography.displaySample')}
            </p>
          </div>
          <div className="rounded-3xl border border-charcoal/10 bg-white p-6 sm:p-8">
            <p className="text-xs text-muted">{t('typography.text')}</p>
            <p className="mt-4 text-lg leading-relaxed text-charcoal">
              {t('typography.textSample')}
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
