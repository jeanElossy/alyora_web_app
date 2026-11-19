import path from 'node:path';
import { createBrevoTransport, createFileTransport } from '@alyora/api';

/**
 * Le transport des e-mails choisi par la configuration : Brevo en production, un dossier
 * local en développement et en test.
 *
 * @param {import('./config.js').WorkerConfig['email']} email
 * @param {{ fetchImpl?: typeof fetch }} [options] Point d'injection pour les tests.
 * @returns {ReturnType<typeof createFileTransport>}
 */
export function createMailTransport(email, { fetchImpl } = {}) {
  if (email.transport === 'brevo') {
    return createBrevoTransport({ apiKey: email.apiKey, sender: email.sender, fetchImpl });
  }
  return createFileTransport({ directory: path.resolve(email.outboxDir) });
}
