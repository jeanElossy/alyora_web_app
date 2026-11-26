import {
  AUTH_WEB_PATHS,
  EMAILED_TOKEN_PARAM,
  EMAIL_VERIFICATION_TTL_SECONDS,
  PASSWORD_RESET_TTL_SECONDS,
} from '@alyora/shared';
import { createTranslator, supportedLocale } from '../../lib/i18n/translator.js';
import { createEmailComposer } from '../../lib/mail/compose-email.js';
import fr from './locales/fr.json' with { type: 'json' };

// E-mails de l'authentification. Les textes viennent des traductions (locales/), dans la
// langue du destinataire ; la mise en forme (texte et HTML échappé) est commune
// (lib/mail/compose-email.js).

/**
 * @typedef {object} Recipient
 * @property {string} email
 * @property {string} firstName
 * @property {string} timezone
 * @property {string | null} [locale] Langue du compte ; la langue par défaut sinon.
 */

/**
 * @param {Date} date
 * @param {Recipient} to
 * @returns {string} La date et l'heure, dans la langue et le fuseau du destinataire.
 */
function formatDate(date, to) {
  return new Intl.DateTimeFormat(supportedLocale(to.locale), {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: to.timezone,
  }).format(date);
}

/**
 * Rédaction des e-mails, liée à l'origine de l'application web.
 *
 * @param {{ webAppUrl: string }} options
 */
export function createAuthEmails({ webAppUrl }) {
  const { t } = createTranslator({ resources: { fr: { auth: fr } }, namespace: 'auth' });

  /**
   * Lien vers une page de l'application, le jeton dans le fragment : il n'atteint jamais un
   * serveur, ni les logs, ni l'en-tête Referer.
   *
   * @param {string} path
   * @param {string} [token]
   */
  const link = (path, token) =>
    `${webAppUrl}${path}${token ? `#${EMAILED_TOKEN_PARAM}=${encodeURIComponent(token)}` : ''}`;

  const compose = createEmailComposer(t);

  const secureAccount = link(AUTH_WEB_PATHS.forgotPassword);

  return {
    /** @param {Recipient} to @param {string} token */
    verifyEmail: (to, token) =>
      compose(
        to,
        'verifyEmail',
        ['welcome', ['validity', { count: EMAIL_VERIFICATION_TTL_SECONDS / 3600 }], 'notYou'],
        link(AUTH_WEB_PATHS.verifyEmail, token),
      ),

    /** @param {Recipient} to */
    accountExists: (to) =>
      compose(to, 'accountExists', ['attempt', 'ifYou', 'otherwise'], secureAccount),

    /** @param {Recipient} to @param {string} token */
    resetPassword: (to, token) =>
      compose(
        to,
        'resetPassword',
        ['request', ['validity', { count: PASSWORD_RESET_TTL_SECONDS / 60 }], 'notYou'],
        link(AUTH_WEB_PATHS.resetPassword, token),
      ),

    /**
     * @param {Recipient} to
     * @param {Date} changedAt
     * @param {{ otherDevicesOnly?: boolean }} [options] Changé depuis un appareil resté connecté.
     */
    passwordChanged: (to, changedAt, { otherDevicesOnly = false } = {}) =>
      compose(
        to,
        'passwordChanged',
        [
          ['changed', { date: formatDate(changedAt, to) }],
          otherDevicesOnly ? 'otherDevices' : 'allDevices',
          'notYou',
        ],
        secureAccount,
      ),

    /** @param {Recipient} to @param {Date} lockedUntil */
    accountLocked: (to, lockedUntil) =>
      compose(
        to,
        'accountLocked',
        ['failures', ['until', { date: formatDate(lockedUntil, to) }], 'notYou'],
        secureAccount,
      ),

    /** @param {Recipient} to */
    twoFactorEnabled: (to) =>
      compose(to, 'twoFactorEnabled', ['active', 'backupCodes', 'notYou'], secureAccount),

    /** @param {Recipient} to */
    twoFactorDisabled: (to) =>
      compose(to, 'twoFactorDisabled', ['inactive', 'notYou'], secureAccount),

    /** @param {Recipient} to */
    suspiciousSession: (to) =>
      compose(to, 'suspiciousSession', ['reuse', 'signedOut', 'notYou'], secureAccount),
  };
}

/** @typedef {ReturnType<typeof createAuthEmails>} AuthEmails */
