// Page du design system (hors production) : tous les composants de components/ui, dans tous
// leurs états, avec leurs textes traduits. Elle sert de référence et de banc d'essai : les
// tests de bout en bout la parcourent au clavier, en 360 px.
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { CONTAINER } from '../../app/SpaceShell.jsx';
import { Field } from '../../components/ui/Field.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { DEFAULT_LANGUAGE, KEYS_LANGUAGE, registerNamespace } from '../../lib/i18n/i18n.js';
import fr from './locales/fr.json';
import { NAMESPACE } from './namespace.js';
import { ActionsSection } from './sections/ActionsSection.jsx';
import { DataSection } from './sections/DataSection.jsx';
import { FieldsSection } from './sections/FieldsSection.jsx';
import { FormSection } from './sections/FormSection.jsx';
import { FoundationsSection } from './sections/FoundationsSection.jsx';
import { NavigationSection } from './sections/NavigationSection.jsx';
import { OverlaysSection } from './sections/OverlaysSection.jsx';

registerNamespace(NAMESPACE, fr);

/** Sections de la page, dans l'ordre du sommaire. */
const SECTIONS = /** @type {const} */ ([
  'foundations',
  'actions',
  'fields',
  'form',
  'navigation',
  'overlays',
  'data',
]);

export function DesignSystemPage() {
  const { t, i18n } = useTranslation(NAMESPACE);
  const showsKeys = i18n.language === KEYS_LANGUAGE;

  return (
    <div className="min-h-dvh bg-ivory text-charcoal">
      <title>{t('documentTitle')}</title>
      <header className={`${CONTAINER} pt-8 pb-14 sm:pt-12 sm:pb-20`}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Link
            to="/"
            className="font-display text-2xl font-semibold tracking-[0.22em] text-forest"
          >
            {t('brand', { ns: 'common' })}
          </Link>
          {/* Langue des clés : chaque texte affiché devient sa clé, ce qui révèle un oubli. */}
          <Field label={t('language.label')} className="w-full sm:w-64">
            {(control) => (
              <Select
                {...control}
                value={showsKeys ? 'keys' : 'fr'}
                onValueChange={(value) =>
                  void i18n.changeLanguage(value === 'keys' ? KEYS_LANGUAGE : DEFAULT_LANGUAGE)
                }
                placeholder={t('language.label')}
                options={[
                  { value: 'fr', label: t('language.fr') },
                  { value: 'keys', label: t('language.keys') },
                ]}
              />
            )}
          </Field>
        </div>
        <p className="mt-14 text-xs font-medium tracking-[0.26em] text-champagne-deep uppercase">
          {t('eyebrow')}
        </p>
        <h1 className="mt-4 font-display text-5xl leading-[1.05] font-semibold text-forest sm:text-6xl">
          {t('title')}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{t('intro')}</p>
        <nav aria-label={t('toc.label')} className="mt-10">
          <ul className="flex flex-wrap gap-2">
            {SECTIONS.map((id) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-flex rounded-full border border-charcoal/15 bg-white/60 px-4 py-2 text-sm text-forest transition-colors hover:border-forest"
                >
                  {t(`sections.${id}.title`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main>
        <FoundationsSection />
        <ActionsSection />
        <FieldsSection />
        <FormSection />
        <NavigationSection />
        <OverlaysSection />
        <DataSection />
      </main>
    </div>
  );
}
