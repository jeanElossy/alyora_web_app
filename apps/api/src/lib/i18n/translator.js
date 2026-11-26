import { DEFAULT_LOCALE, LOCALES } from '@alyora/shared';
import i18next from 'i18next';

/** @typedef {(typeof LOCALES)[number]} Locale */

/**
 * La langue d'un destinataire, si l'application la connaît, sinon la langue par défaut.
 *
 * @param {string | null | undefined} locale
 * @returns {Locale}
 */
export function supportedLocale(locale) {
  return LOCALES.find((supported) => supported === locale) ?? DEFAULT_LOCALE;
}

/**
 * Traducteur côté serveur (e-mails), sur i18next comme l'interface web : une instance propre,
 * initialisée de façon synchrone avec des ressources en mémoire. Les valeurs interpolées ne
 * sont pas échappées : le texte produit est brut, et c'est à l'appelant de l'échapper s'il en
 * fait du HTML.
 *
 * @param {object} options
 * @param {import('i18next').Resource} options.resources Par langue puis par espace de noms,
 *   ex. { fr: { auth: {...} } }.
 * @param {string} options.namespace Espace de noms des clés.
 */
export function createTranslator({ resources, namespace }) {
  const instance = i18next.createInstance();
  void instance.init({
    resources,
    ns: [namespace],
    defaultNS: namespace,
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...LOCALES],
    initAsync: false,
    interpolation: { escapeValue: false },
  });

  return {
    /**
     * @param {string | null | undefined} locale Langue du destinataire.
     * @param {string} key
     * @param {Record<string, unknown>} [values] Valeurs à interpoler ; `count` choisit le pluriel.
     * @returns {string}
     */
    t(locale, key, values = {}) {
      return instance.t(key, { ...values, lng: supportedLocale(locale) });
    },
  };
}

/** @typedef {ReturnType<typeof createTranslator>} Translator */
