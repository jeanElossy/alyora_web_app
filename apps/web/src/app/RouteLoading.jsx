import { useTranslation } from 'react-i18next';
import { useNavigation } from 'react-router';

/**
 * Affiché au premier chargement, pendant que le bundle de l'espace et ses gardes se
 * chargent (HydrateFallback de la route racine).
 */
export function RouteLoading() {
  const { t } = useTranslation();

  return (
    <div role="status" className="grid min-h-dvh place-items-center bg-ivory">
      <span
        aria-hidden="true"
        className="h-10 w-10 animate-spin rounded-full border-4 border-forest border-t-transparent motion-reduce:animate-none"
      />
      <span className="sr-only">{t('loading')}</span>
    </div>
  );
}

/**
 * Barre de progression en haut de l'écran pendant une navigation (chargement d'un espace,
 * garde de session) : la page actuelle reste affichée et utilisable.
 */
export function NavigationProgress() {
  const navigation = useNavigation();
  const { t } = useTranslation();

  if (navigation.state === 'idle') {
    return null;
  }
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 h-1 bg-champagne">
      <span className="sr-only">{t('loading')}</span>
    </div>
  );
}
