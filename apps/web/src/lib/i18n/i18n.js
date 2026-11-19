import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import common from '../../locales/common/fr.json';

/** Seule langue de l'interface pour l'instant. */
export const DEFAULT_LANGUAGE = 'fr';

/**
 * Langue spéciale d'i18next : t() renvoie la clé au lieu du texte. Sert aux tests, pour
 * prouver qu'aucun texte n'échappe aux traductions.
 */
export const KEYS_LANGUAGE = 'cimode';

/** Espace de noms par défaut : textes communs à toute l'application (erreurs, chargement...). */
export const COMMON_NAMESPACE = 'common';

/**
 * Initialise i18next, de façon synchrone : les traductions communes sont dans le bundle
 * initial, si bien que le premier rendu a déjà ses textes. Sans effet si déjà fait.
 *
 * @returns {import('i18next').i18n}
 */
export function initI18n() {
  if (!i18next.isInitialized) {
    void i18next.use(initReactI18next).init({
      lng: DEFAULT_LANGUAGE,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [DEFAULT_LANGUAGE],
      ns: [COMMON_NAMESPACE],
      defaultNS: COMMON_NAMESPACE,
      resources: { [DEFAULT_LANGUAGE]: { [COMMON_NAMESPACE]: common } },
      initAsync: false,
      // React échappe déjà le texte rendu.
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  }
  return i18next;
}

/**
 * Enregistre les traductions d'un espace ou d'une fonctionnalité, chargées avec son bundle.
 * Appelée au chargement du module, donc avant le premier rendu de ses composants.
 *
 * @param {string} namespace
 * @param {Record<string, unknown>} resources Traductions françaises de cet espace de noms.
 */
export function registerNamespace(namespace, resources) {
  const i18n = initI18n();
  if (!i18n.hasResourceBundle(DEFAULT_LANGUAGE, namespace)) {
    i18n.addResourceBundle(DEFAULT_LANGUAGE, namespace, resources);
  }
}
