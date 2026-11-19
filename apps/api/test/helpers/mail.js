import { AUTH_WEB_PATHS, EMAILED_TOKEN_PARAM } from '@alyora/shared';

/**
 * Mailer de test : enregistre les e-mails au lieu de les mettre en file. `failing` simule une
 * file injoignable.
 */
export function createRecordingMailer() {
  /** @type {import('../../src/lib/mail/mail-queue.js').MailMessage[]} */
  const sent = [];
  return {
    sent,
    failing: false,
    /** @param {import('../../src/lib/mail/mail-queue.js').MailMessage} message */
    async send(message) {
      if (this.failing) {
        throw new Error('Mail queue unreachable');
      }
      sent.push(message);
    },
    /** @param {string} to */
    to(to) {
      return sent.filter((message) => message.to === to);
    },
    clear() {
      sent.length = 0;
    },
  };
}

/**
 * Attend le n-ième e-mail adressé à `to` : certaines routes répondent avant de l'envoyer.
 *
 * @param {ReturnType<typeof createRecordingMailer>} mailer
 * @param {string} to
 * @param {number} [count]
 */
export async function waitForMail(mailer, to, count = 1) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const received = mailer.to(to);
    if (received.length >= count) {
      return received[count - 1];
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`No e-mail number ${count} for this recipient`);
}

/**
 * Jeton d'un lien d'e-mail (dans le fragment : `#jeton=...`).
 *
 * @param {import('../../src/lib/mail/mail-queue.js').MailMessage | undefined} message
 * @param {keyof typeof AUTH_WEB_PATHS} page
 * @returns {string}
 */
export function tokenFrom(message, page) {
  const path = AUTH_WEB_PATHS[page].replaceAll('/', '\\/');
  const match = new RegExp(`${path}#${EMAILED_TOKEN_PARAM}=([A-Za-z0-9_-]{43})`).exec(
    message?.text ?? '',
  );
  if (!match?.[1]) {
    throw new Error(`No ${page} link in the e-mail`);
  }
  return match[1];
}
