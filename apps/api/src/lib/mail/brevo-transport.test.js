import { randomBytes } from 'node:crypto';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import {
  BREVO_SEND_URL,
  MailDeliveryError,
  MailRejectedError,
  createBrevoTransport,
} from './brevo-transport.js';

// Fausse clé construite à l'exécution : aucune clé, même factice, n'est écrite dans le dépôt.
const API_KEY = ['xkeysib', randomBytes(32).toString('hex'), 'test'].join('-');
const sender = { email: 'no-reply@alyora.com', name: 'ALYORA' };
const message = {
  to: 'awa@exemple.ci',
  subject: 'Confirmez votre adresse e-mail',
  text: 'Lien : https://alyora-web.vercel.app/verifier-email#jeton=abc',
  html: '<p>Lien</p>',
};

/**
 * @param {number} status
 * @param {unknown} [body]
 */
function respond(status, body) {
  /** @type {(url: string, init: RequestInit) => Promise<Response>} */
  const answer = async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  return vi.fn(answer);
}

/**
 * @param {ReturnType<typeof vi.fn>} fetchImpl
 * @param {number} [timeoutMs]
 */
function transportWith(fetchImpl, timeoutMs) {
  return createBrevoTransport({
    apiKey: API_KEY,
    sender,
    fetchImpl: /** @type {typeof fetch} */ (/** @type {unknown} */ (fetchImpl)),
    timeoutMs,
  });
}

/**
 * L'erreur levée par l'envoi, ou un échec du test si l'envoi a réussi.
 *
 * @param {Promise<unknown>} sending
 * @returns {Promise<MailDeliveryError | MailRejectedError>}
 */
async function failureOf(sending) {
  try {
    await sending;
  } catch (error) {
    if (error instanceof MailDeliveryError || error instanceof MailRejectedError) {
      return error;
    }
    throw error;
  }
  throw new Error('send() was expected to fail');
}

/** @param {unknown} error */
function leaks(error) {
  const text = `${String(error)} ${JSON.stringify(error)}`;
  return [API_KEY, message.to, message.subject, 'jeton'].filter((secret) => text.includes(secret));
}

describe('brevo transport', () => {
  it('posts the e-mail to the Brevo API, with the key in its header and no redirect', async () => {
    const fetchImpl = respond(201, { messageId: '<202611191513.123@smtp-relay.mailin.fr>' });

    const receipt = await transportWith(fetchImpl).send(message);

    expect(receipt).toEqual({ providerMessageId: '<202611191513.123@smtp-relay.mailin.fr>' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0];
    if (!call) {
      throw new Error('fetch was not called');
    }
    const [url, init] = call;
    expect(url).toBe(BREVO_SEND_URL);
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: { 'api-key': API_KEY, 'content-type': 'application/json' },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({
      sender,
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
    });
  });

  it('succeeds without receipt when the answer has no usable message identifier', async () => {
    await expect(transportWith(respond(201)).send(message)).resolves.toEqual({
      providerMessageId: undefined,
    });
    await expect(
      transportWith(respond(201, { messageId: 'with spaces' })).send(message),
    ).resolves.toEqual({ providerMessageId: undefined });
  });

  it.each([
    [400, 'invalid_parameter'],
    [401, 'unauthorized'],
    [402, 'not_enough_credits'],
    [403, 'permission_denied'],
  ])('fails for good on %i: retrying would not help', async (status, providerCode) => {
    const error = await failureOf(
      transportWith(respond(status, { code: providerCode, message: `refused ${message.to}` })).send(
        message,
      ),
    );

    expect(error).toBeInstanceOf(MailRejectedError);
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(error).toMatchObject({ code: `BREVO_HTTP_${status}`, providerCode });
    expect(leaks(error)).toEqual([]);
  });

  it.each([408, 429, 500, 503])('asks for a retry on %i', async (status) => {
    const error = await failureOf(transportWith(respond(status, { code: 'x' })).send(message));

    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(error).not.toBeInstanceOf(UnrecoverableError);
    expect(error.code).toBe(`BREVO_HTTP_${status}`);
    expect(leaks(error)).toEqual([]);
  });

  it('asks for a retry when Brevo cannot be reached', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed', { cause: new Error(`connect ECONNREFUSED ${API_KEY}`) });
    });

    const error = await failureOf(transportWith(fetchImpl).send(message));

    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(error.code).toBe('BREVO_UNREACHABLE');
    expect(error.cause).toBeUndefined();
    expect(leaks(error)).toEqual([]);
  });

  it('gives up waiting after the time limit, and asks for a retry', async () => {
    const fetchImpl = vi.fn(
      (/** @type {string} */ _url, /** @type {RequestInit} */ init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );

    const error = await failureOf(transportWith(fetchImpl, 20).send(message));

    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(error.code).toBe('BREVO_TIMEOUT');
  });

  it('keeps only a well-formed provider code, never free text from the answer', async () => {
    const malformed = await failureOf(
      transportWith(respond(400, { code: `bad <b>${message.to}</b>` })).send(message),
    );
    const notJson = await failureOf(
      transportWith(
        vi.fn(async () => new Response('<html>Bad Gateway</html>', { status: 502 })),
      ).send(message),
    );

    expect(malformed.providerCode).toBeUndefined();
    expect(leaks(malformed)).toEqual([]);
    expect(notJson).toMatchObject({ code: 'BREVO_HTTP_502', providerCode: undefined });
  });
});
