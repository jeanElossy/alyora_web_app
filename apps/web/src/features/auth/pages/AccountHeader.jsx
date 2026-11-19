import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { NAMESPACE } from '../namespace.js';
import { useSpaceHandle } from '../space-handle.js';

/**
 * En-tête des pages du compte : surtitre, titre éditorial, et onglets Mon compte / Sécurité
 * (liens, l'actif porte aria-current).
 *
 * @param {{ title: string, intro: string }} props
 */
export function AccountHeader({ title, intro }) {
  const { t } = useTranslation(NAMESPACE);
  const { home } = useSpaceHandle();
  const tabs = [
    { to: `${home}/profil`, label: t('account.profile') },
    { to: `${home}/securite`, label: t('account.security') },
  ];

  return (
    <header>
      <p className="text-xs font-medium tracking-[0.24em] text-champagne-deep uppercase">
        {t('account.eyebrow')}
      </p>
      <h1 className="mt-3 font-display text-4xl leading-tight font-semibold text-forest sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-prose leading-relaxed text-muted sm:text-lg">{intro}</p>
      <nav aria-label={t('account.navLabel')} className="mt-8 border-b border-charcoal/10">
        <ul className="-mb-px flex gap-7 overflow-x-auto">
          {tabs.map((tab) => (
            <li key={tab.to} className="shrink-0">
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  `block border-b-2 py-3 text-sm transition-colors ${
                    isActive
                      ? 'border-forest font-medium text-forest'
                      : 'border-transparent text-muted hover:text-forest'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
