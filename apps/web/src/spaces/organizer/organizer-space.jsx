// Bundle de l'espace organisateur : mise en page, pages et traductions, chargés à la première visite.
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { PageMessage } from '../../app/PageMessage.jsx';
import { SpaceHome } from '../../app/SpaceHome.jsx';
import { SpaceShell } from '../../app/SpaceShell.jsx';
import { SignOutButton } from '../../features/auth/components/SignOutButton.jsx';
import { registerNamespace } from '../../lib/i18n/i18n.js';
import fr from './locales/fr.json';

export const NAMESPACE = 'organizer';
export const HOME_PATH = '/organisateur';

registerNamespace(NAMESPACE, fr);

export function Layout() {
  const { t } = useTranslation(NAMESPACE);

  return (
    <SpaceShell
      homePath={HOME_PATH}
      spaceName={t('space.name')}
      navLabel={t('nav.label')}
      navItems={[
        { to: HOME_PATH, label: t('nav.home'), end: true },
        { to: `${HOME_PATH}/profil`, label: t('nav.profile') },
        { to: `${HOME_PATH}/securite`, label: t('nav.security') },
      ]}
      actions={
        <SignOutButton
          loginPath={`${HOME_PATH}/connexion`}
          label={t('account.signOut')}
          pendingLabel={t('account.signingOut')}
        />
      }
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
