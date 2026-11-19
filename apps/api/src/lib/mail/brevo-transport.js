import { UnrecoverableError } from 'bullmq';

/** Point d'envoi des e-mails transactionnels de Brevo (API v3). */
export const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

/** Délai maximal d'un appel, lecture de la réponse comprise : au-delà, le job est retenté. */
export const BREVO_TIMEOUT_MS = 10_000;

/** Code d'erreur de Brevo (« unauthorized », « not_enough_credits »...) : rien d'autre. */
const PROVIDER_CODE = /^[a-z_]{1,64}$/;

/** Identifiant du message chez Brevo, gardé pour le suivi : borné, sans espace. */
const PROVIDER_MESSAGE_ID = /^\S{1,256}$/;

/**
 * Échec passager (Brevo surchargé, indisponible ou injoignable) : BullMQ retentera le job.
 * Ni le message ni les propriétés ne contiennent la clé, le destinataire ou le contenu.
 */
export class MailDeliveryError extends Error {
  /**
   * @param {string} code Ex. BREVO_HTTP_503, BREVO_TIMEOUT.
   * @param {string} [providerCode]
   */
  constructor(code, providerCode) {
    super(`E-mail delivery failed (${code})`);
    this.name = 'MailDeliveryError';
    this.code = code;
    this.providerCode = providerCode;
  }
}

/**
 * Refus définitif (clé invalide, adresse IP non autorisée, expéditeur non validé, crédits
 * épuisés...) : retenter ne changerait rien, donc BullMQ passe le job en échec tout de suite.
 */
export class MailRejectedError extends UnrecoverableError {
  /**
   * @param {string} code Ex. BREVO_HTTP_401.
   * @param {string} [providerCode]
   */
  constructor(code, providerCode) {
    super(`E-mail rejected by the provider (${code})`);
    this.name = 'MailRejectedError';
    this.code = code;
    this.providerCode = providerCode;
  }
}

/**
 * @typedef {object} BrevoTransportOptions
 * @property {string} apiKey Clé de l'API Brevo (jamais une clé SMTP).
 * @property {{ email: string, name: string }} sender Expéditeur, d'un domaine validé chez Brevo.
 * @property {typeof fetch} [fetchImpl] Point d'injection pour les tests.
 * @property {number} [timeoutMs]
 */

/**
 * Transport de production : chaque e-mail part par l'API HTTP de Brevo, sans bibliothèque.
 *
 * Les statuts 408, 429 et 5xx (et toute panne réseau) sont passagers : le job est retenté
 * selon MAIL_JOB_OPTIONS. Tout autre refus est définitif. Si Brevo accepte l'e-mail mais que
 * sa réponse se perd, la nouvelle tentative l'envoie une seconde fois : un doublon, identique.
 *
 * @param {BrevoTransportOptions} options
 * @returns {import('./mail-processor.js').MailTransport}
 */
export function createBrevoTransport({
  apiKey,
  sender,
  fetchImpl = globalThis.fetch,
  timeoutMs = BREVO_TIMEOUT_MS,
}) {
  return {
    async send(message) {
      const signal = AbortSignal.timeout(timeoutMs);
      /** @type {Response} */
      let response;
      try {
        response = await fetchImpl(BREVO_SEND_URL, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'api-key': apiKey,
          },
          body: JSON.stringify({
            sender: { email: sender.email, name: sender.name },
            to: [{ email: message.to }],
            subject: message.subject,
            htmlContent: message.html,
            textContent: message.text,
          }),
          // Jamais de redirection : elle emporterait la clé vers une autre adresse.
          redirect: 'error',
          signal,
        });
      } catch {
        throw new MailDeliveryError(signal.aborted ? 'BREVO_TIMEOUT' : 'BREVO_UNREACHABLE');
      }
      const body = await readJson(response);
      if (response.ok) {
        return { providerMessageId: matching(stringField(body, 'messageId'), PROVIDER_MESSAGE_ID) };
      }
      const code = `BREVO_HTTP_${response.status}`;
      const providerCode = matching(stringField(body, 'code'), PROVIDER_CODE);
      if (isTransient(response.status)) {
        throw new MailDeliveryError(code, providerCode);
      }
      throw new MailRejectedError(code, providerCode);
    },
  };
}

/** @param {number} status */
function isTransient(status) {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Corps JSON de la réponse, ou undefined s'il est absent, illisible ou trop lent à venir.
 *
 * @param {Response} response
 * @returns {Promise<unknown>}
 */
async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * @param {unknown} body
 * @param {string} name
 * @returns {string | undefined}
 */
function stringField(body, name) {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const value = /** @type {Record<string, unknown>} */ (body)[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * @param {string | undefined} value
 * @param {RegExp} pattern
 * @returns {string | undefined}
 */
function matching(value, pattern) {
  return value !== undefined && pattern.test(value) ? value : undefined;
}
