// Rédaction commune des e-mails de l'application : chaque module fournit ses traductions
// (salutation, signature, paragraphes de chaque e-mail), et reçoit des messages au même format,
// en texte et en HTML sobre, tout texte échappé pour le HTML.

/**
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
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
 * @property {string | null} firstName null pour une adresse sans compte : salutation neutre.
 * @property {string | null} [locale] Langue du compte ; la langue par défaut sinon.
 */

/**
 * Un paragraphe : sa clé dans emails.<e-mail>, et les valeurs à y interpoler.
 *
 * @typedef {string | [string, Record<string, unknown>]} Paragraph
 */

/**
 * Compose les e-mails d'un module. Clés attendues dans ses traductions : `emails.greeting`
 * (avec `{{firstName}}`), `emails.greetingAnonymous`, `emails.signature`, et pour chaque
 * e-mail `emails.<name>.subject`, `emails.<name>.action` et ses paragraphes.
 *
 * @param {import('../i18n/translator.js').Translator['t']} t
 */
export function createEmailComposer(t) {
  /**
   * @param {Recipient} to
   * @param {string} name Nom de l'e-mail dans les traductions (emails.<name>).
   * @param {Paragraph[]} paragraphs
   * @param {string} url Lien du bouton d'action.
   * @returns {import('./mail-queue.js').MailMessage}
   */
  return function compose(to, name, paragraphs, url) {
    const locale = to.locale;
    const greeting = to.firstName
      ? t(locale, 'emails.greeting', { firstName: to.firstName })
      : t(locale, 'emails.greetingAnonymous');
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
  };
}

/**
 * Met un e-mail en file d'attente sans jamais faire échouer l'opération qui l'envoie : elle
 * est déjà validée en base. Un échec est journalisé, sans destinataire.
 *
 * @param {{ mailer: import('./mail-queue.js').Mailer, logger: import('pino').Logger }} deps
 * @param {import('./mail-queue.js').MailMessage} message
 * @param {string} event Nature de l'e-mail, pour le log.
 * @returns {Promise<void>}
 */
export async function sendSafely({ mailer, logger }, message, event) {
  try {
    await mailer.send(message);
  } catch (error) {
    logger.error({ err: error, event }, 'Unable to queue an email');
  }
}
