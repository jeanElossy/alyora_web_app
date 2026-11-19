import { Queue } from 'bullmq';
import { z } from 'zod';

/** File BullMQ des e-mails à envoyer, partagée par l'API (producteur) et le worker. */
export const MAIL_QUEUE_NAME = 'email';
export const MAIL_JOB_NAME = 'send';

/** Données associées du chiffrement : un chiffré d'e-mail ne vaut pour aucun autre usage. */
export const MAIL_ENCRYPTION_CONTEXT = 'mail:v1';

/** Un e-mail prêt à partir, rédigé par l'API. */
export const mailMessageSchema = z.strictObject({
  to: z.email(),
  subject: z.string().min(1).max(200),
  text: z.string().min(1).max(20_000),
  html: z.string().min(1).max(100_000),
});

/** @typedef {z.infer<typeof mailMessageSchema>} MailMessage */

/**
 * @typedef {object} Mailer
 * @property {(message: MailMessage) => Promise<void>} send Met l'e-mail en file d'attente.
 */

/**
 * Options des jobs d'e-mail : cinq tentatives espacées (30 s, 1 min, 2 min...), puis le job
 * reste en échec 7 jours pour diagnostic. Réussi, il est supprimé tout de suite.
 */
export const MAIL_JOB_OPTIONS = Object.freeze({
  attempts: 5,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: true,
  removeOnFail: { age: 7 * 24 * 60 * 60 },
});

/**
 * @param {import('ioredis').Redis} connection
 * @returns {Queue}
 */
export function createMailQueue(connection) {
  return new Queue(MAIL_QUEUE_NAME, { connection, defaultJobOptions: { ...MAIL_JOB_OPTIONS } });
}

/**
 * Mailer de l'API : l'e-mail entier (destinataire, liens qui portent des jetons) est chiffré
 * (AES-256-GCM) avant d'entrer dans Redis. Seul le worker, qui a la même clé, le lit.
 *
 * @param {object} deps
 * @param {{ add: (name: string, data: { sealed: string }) => Promise<unknown> }} deps.queue
 * @param {import('../crypto/secret-box.js').SecretBox} deps.secretBox
 * @returns {Mailer}
 */
export function createQueueMailer({ queue, secretBox }) {
  return {
    async send(message) {
      const valid = mailMessageSchema.parse(message);
      const sealed = secretBox.encrypt(JSON.stringify(valid), MAIL_ENCRYPTION_CONTEXT);
      await queue.add(MAIL_JOB_NAME, { sealed });
    },
  };
}
