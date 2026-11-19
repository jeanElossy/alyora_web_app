// Bundle de l'espace d'accueil des invités : mise en page, pages et traductions, chargés à la première visite.
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { LoginShell } from '../../app/LoginShell.jsx';
import { PageMessage } from '../../app/PageMessage.jsx';
import { SpaceHome } from '../../app/SpaceHome.jsx';
import { SpaceShell } from '../../app/SpaceShell.jsx';
import { registerNamespace } from '../../lib/i18n/i18n.js';
import fr from './locales/fr.json';

export const NAMESPACE = 'checkin';
export const HOME_PATH = '/accueil';

registerNamespace(NAMESPACE, fr);

export function Layout() {
  const { t } = useTranslation(NAMESPACE);

  return (
    <SpaceShell
      homePath={HOME_PATH}
      spaceName={t('space.name')}
      navLabel={t('nav.label')}
      navItems={[{ to: HOME_PATH, label: t('nav.home'), end: true }]}
    >
      <Outlet />
    </SpaceShell>
  );
}

export function HomePage() {
  const { t } = useTranslation(NAMESPACE);

  return (
    <SpaceHome
      documentTitle={t('home.documentTitle')}
      eyebrow={t('space.name')}
      title={t('home.title')}
      intro={t('home.intro')}
      emptyTitle={t('home.emptyTitle')}
      emptyMessage={t('home.emptyMessage')}
    />
  );
}

export function NotFoundPage() {
  const { t } = useTranslation(NAMESPACE);

  return (
    <PageMessage
      documentTitle={t('notFound.documentTitle')}
      numeral="404"
      title={t('notFound.title')}
      message={t('notFound.message')}
      action={{ to: HOME_PATH, label: t('notFound.back') }}
    />
  );
}

/** Coquille de connexion, sans formulaire : le module d'authentification la remplacera. */
export function LoginPage() {
  const { t } = useTranslation(NAMESPACE);

  return (
    <LoginShell
      documentTitle={t('login.documentTitle')}
      spaceName={t('space.name')}
      title={t('login.title')}
      message={t('login.message')}
    />
  );
}
