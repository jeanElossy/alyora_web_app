import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMailTransport } from './mail-transport.js';

const message = {
  to: 'awa@exemple.ci',
  subject: 'Confirmez votre adresse e-mail',
  text: 'Lien',
  html: '<p>Lien</p>',
};

/** @type {string[]} */
const directories = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('createMailTransport', () => {
  it('sends through the Brevo API when the configuration says brevo', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"messageId":"<m1@relay>"}', { status: 201 }),
    );
    const apiKey = ['xkeysib', randomBytes(32).toString('hex'), 'test'].join('-');
    const transport = createMailTransport(
      { transport: 'brevo', apiKey, sender: { email: 'no-reply@alyora.com', name: 'ALYORA' } },
      { fetchImpl: /** @type {typeof fetch} */ (/** @type {unknown} */ (fetchImpl)) },
    );

    await expect(transport.send(message)).resolves.toEqual({ providerMessageId: '<m1@relay>' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.anything(),
    );
  });

  it('writes to the outbox directory with the file transport', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'alyora-worker-mail-'));
    directories.push(directory);

    await createMailTransport({ transport: 'file', outboxDir: directory }).send(message);

    expect(await readdir(directory)).toHaveLength(1);
  });
});
