import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { MAIL_ENCRYPTION_CONTEXT, mailMessageSchema } from './mail-queue.js';

/**
 * @typedef {object} MailTransport
 * @property {(message: import('./mail-queue.js').MailMessage) => Promise<void>} send
 */

/**
 * Transport de développement et de test : chaque e-mail devient un fichier JSON dans un
 * dossier local (lisible par son seul propriétaire), jamais une ligne de log, puisqu'il
 * contient des jetons. Refusé en production par la configuration du worker.
 *
 * @param {{ directory: string }} options
 * @returns {MailTransport}
 */
export function createFileTransport({ directory }) {
  return {
    async send(message) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const name = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.json`;
      await writeFile(path.join(directory, name), `${JSON.stringify(message, null, 2)}\n`, {
        mode: 0o600,
        flag: 'wx',
      });
    },
  };
}

/**
 * Traitement d'un job de la file des e-mails (côté worker) : déchiffre, vérifie, envoie. Le
 * log du job ne contient ni le destinataire ni le contenu.
 *
 * @param {object} deps
 * @param {import('../crypto/secret-box.js').SecretBox} deps.secretBox
 * @param {MailTransport} deps.transport
 * @param {import('pino').Logger} deps.logger
 * @returns {(job: { id?: string, data: { sealed?: unknown } }) => Promise<void>}
 */
export function createMailProcessor({ secretBox, transport, logger }) {
  return async (job) => {
    if (typeof job.data.sealed !== 'string') {
      throw new TypeError('Mail job without sealed content');
    }
    const message = mailMessageSchema.parse(
      JSON.parse(secretBox.decrypt(job.data.sealed, MAIL_ENCRYPTION_CONTEXT)),
    );
    await transport.send(message);
    logger.info({ jobId: job.id }, 'Email sent');
  };
}
