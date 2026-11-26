import {
  AUTH_WEB_PATHS,
  EMAILED_TOKEN_PARAM,
  EMAIL_VERIFICATION_TTL_SECONDS,
  PASSWORD_RESET_TTL_SECONDS,
} from '@alyora/shared';
import { createTranslator, supportedLocale } from '../../lib/i18n/translator.js';
import fr from './locales/fr.json' with { type: 'json' };

// E-mails de l'authentification. Les textes viennent des traductions (locales/), dans la
// langue du destinataire. Chaque e-mail a une version texte et une version HTML sobre ; tout
// texte est échappé pour la version HTML, valeurs venues d'un utilisateur (prénom) comprises.

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * @typedef {object} Recipient
 * @property {string} email
 * @property {string} firstName
 * @property {string} timezone
 * @property {string | null} [locale] Langue du compte ; la langue par défaut sinon.
 */

/**
 * Un paragraphe : sa clé dans emails.<e-mail>, et les valeurs à y interpoler.
 *
 * @typedef {string | [string, Record<string, unknown>]} Paragraph
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

  /**
   * @param {Recipient} to
   * @param {string} name Nom de l'e-mail dans les traductions (emails.<name>).
   * @param {Paragraph[]} paragraphs
   * @param {string} url Lien du bouton d'action.
   * @returns {import('../../lib/mail/mail-queue.js').MailMessage}
   */
  function compose(to, name, paragraphs, url) {
    const locale = to.locale;
    const greeting = t(locale, 'emails.greeting', { firstName: to.firstName });
    const signature = t(locale, 'emails.signature');
    const body = paragraphs.map((paragraph) =>
      typeof paragraph === 'string'
        ? t(locale, `emails.${name}.${paragraph}`)
        : t(locale, `emails.${name}.${paragraph[0]}`, paragraph[1]),
    );
    const action = { label: t(locale, `emails.${name}.action`), url };
    const text = [greeting, ...body, `${action.label} : ${action.url}`, signature].join('\n\n');
    const html = [
      `<p>${escapeHtml(greeting)}</p>`,
      ...body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
      `<p><a href="${escapeHtml(action.url)}">${escapeHtml(action.label)}</a></p>`,
      `<p>${escapeHtml(signature)}</p>`,
    ].join('\n');
    return { to: to.email, subject: t(locale, `emails.${name}.subject`), text, html };
  }

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
