import {
  AUTH_WEB_PATHS,
  EMAILED_TOKEN_PARAM,
  EMAIL_VERIFICATION_TTL_SECONDS,
  PASSWORD_RESET_TTL_SECONDS,
} from '@alyora/shared';

// E-mails de l'authentification, en français. Chaque e-mail a une version texte et une
// version HTML sobre ; toute valeur venue d'un utilisateur (prénom) est échappée.

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
 */

/**
 * @param {object} content
 * @param {Recipient} content.to
 * @param {string} content.subject
 * @param {string[]} content.paragraphs Texte brut, échappé pour la version HTML.
 * @param {{ label: string, url: string }} [content.action]
 * @returns {import('../../lib/mail/mail-queue.js').MailMessage}
 */
function compose({ to, subject, paragraphs, action }) {
  const greeting = `Bonjour ${to.firstName},`;
  const signature = 'L’équipe ALYORA';
  const text = [
    greeting,
    ...paragraphs,
    ...(action ? [`${action.label} : ${action.url}`] : []),
    signature,
  ].join('\n\n');
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    ...(action
      ? [`<p><a href="${escapeHtml(action.url)}">${escapeHtml(action.label)}</a></p>`]
      : []),
    `<p>${escapeHtml(signature)}</p>`,
  ].join('\n');
  return { to: to.email, subject, text, html };
}

/**
 * @param {Date} date
 * @param {string} timezone
 * @returns {string}
 */
function formatDate(date, timezone) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(date);
}

/**
 * Rédaction des e-mails, liée à l'origine de l'application web.
 *
 * @param {{ webAppUrl: string }} options
 */
export function createAuthEmails({ webAppUrl }) {
  /**
   * Lien vers une page de l'application, le jeton dans le fragment : il n'atteint jamais un
   * serveur, ni les logs, ni l'en-tête Referer.
   *
   * @param {string} path
   * @param {string} [token]
   */
  const link = (path, token) =>
    `${webAppUrl}${path}${token ? `#${EMAILED_TOKEN_PARAM}=${encodeURIComponent(token)}` : ''}`;

  return {
    /** @param {Recipient} to @param {string} token */
    verifyEmail: (to, token) =>
      compose({
        to,
        subject: 'Confirmez votre adresse e-mail',
        paragraphs: [
          'Bienvenue sur ALYORA. Pour activer votre compte, confirmez votre adresse e-mail.',
          `Ce lien est valable ${EMAIL_VERIFICATION_TTL_SECONDS / 3600} heures et ne sert qu’une fois.`,
          'Si vous n’avez pas créé de compte, ignorez ce message.',
        ],
        action: { label: 'Confirmer mon adresse', url: link(AUTH_WEB_PATHS.verifyEmail, token) },
      }),

    /** @param {Recipient} to */
    accountExists: (to) =>
      compose({
        to,
        subject: 'Une inscription a été tentée avec votre adresse',
        paragraphs: [
          'Quelqu’un a essayé de créer un compte ALYORA avec votre adresse e-mail, qui a déjà un compte.',
          'Si c’était vous, connectez-vous, ou choisissez un nouveau mot de passe si vous l’avez oublié.',
          'Sinon, ignorez ce message : votre compte n’a pas été modifié.',
        ],
        action: {
          label: 'Choisir un nouveau mot de passe',
          url: link(AUTH_WEB_PATHS.forgotPassword),
        },
      }),

    /** @param {Recipient} to @param {string} token */
    resetPassword: (to, token) =>
      compose({
        to,
        subject: 'Choisissez un nouveau mot de passe',
        paragraphs: [
          'Vous avez demandé à changer le mot de passe de votre compte ALYORA.',
          `Ce lien est valable ${PASSWORD_RESET_TTL_SECONDS / 60} minutes et ne sert qu’une fois.`,
          'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.',
        ],
        action: {
          label: 'Choisir un nouveau mot de passe',
          url: link(AUTH_WEB_PATHS.resetPassword, token),
        },
      }),

    /** @param {Recipient} to @param {Date} changedAt */
    passwordChanged: (to, changedAt) =>
      compose({
        to,
        subject: 'Votre mot de passe a été modifié',
        paragraphs: [
          `Le mot de passe de votre compte ALYORA a été modifié le ${formatDate(changedAt, to.timezone)}.`,
          'Par sécurité, tous vos appareils ont été déconnectés.',
          'Si vous n’êtes pas à l’origine de ce changement, choisissez tout de suite un nouveau mot de passe.',
        ],
        action: {
          label: 'Sécuriser mon compte',
          url: link(AUTH_WEB_PATHS.forgotPassword),
        },
      }),

    /** @param {Recipient} to @param {Date} lockedUntil */
    accountLocked: (to, lockedUntil) =>
      compose({
        to,
        subject: 'Connexion à votre compte suspendue',
        paragraphs: [
          'Plusieurs tentatives de connexion à votre compte ALYORA ont échoué.',
          `Par sécurité, la connexion est suspendue jusqu’au ${formatDate(lockedUntil, to.timezone)}.`,
          'Si ce n’était pas vous, choisissez un nouveau mot de passe dès que possible.',
        ],
        action: {
          label: 'Choisir un nouveau mot de passe',
          url: link(AUTH_WEB_PATHS.forgotPassword),
        },
      }),

    /** @param {Recipient} to */
    suspiciousSession: (to) =>
      compose({
        to,
        subject: 'Activité inhabituelle sur votre compte',
        paragraphs: [
          'Une connexion de votre compte ALYORA a été réutilisée d’une façon qui laisse penser à un vol.',
          'Par sécurité, nous avons déconnecté l’appareil concerné. Reconnectez-vous pour continuer.',
          'Si vous ne reconnaissez pas cette activité, choisissez un nouveau mot de passe.',
        ],
        action: {
          label: 'Choisir un nouveau mot de passe',
          url: link(AUTH_WEB_PATHS.forgotPassword),
        },
      }),
  };
}

/** @typedef {ReturnType<typeof createAuthEmails>} AuthEmails */
