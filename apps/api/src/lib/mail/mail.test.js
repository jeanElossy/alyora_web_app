import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestLogger } from '../../../test/helpers/app.js';
import { createSecretBox } from '../crypto/secret-box.js';
import { createFileTransport, createMailProcessor } from './mail-processor.js';
import { MAIL_JOB_NAME, createQueueMailer } from './mail-queue.js';

const message = {
  to: 'awa@exemple.ci',
  subject: 'Confirmez votre adresse e-mail',
  text: 'Lien : http://localhost:5173/verifier-email#jeton=abc',
  html: '<p>Lien</p>',
};

/** @type {string[]} */
const directories = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('queue mailer', () => {
  it('puts only an encrypted payload in the queue: no recipient, no link', async () => {
    const box = createSecretBox(randomBytes(32));
    const queue = { add: vi.fn(async () => {}) };
    const mailer = createQueueMailer({ queue, secretBox: box });

    await mailer.send(message);

    expect(queue.add).toHaveBeenCalledOnce();
    const [name, data] = /** @type {[string, { sealed: string }]} */ (
      /** @type {unknown} */ (queue.add.mock.calls[0])
    );
    expect(name).toBe(MAIL_JOB_NAME);
    expect(JSON.stringify(data)).not.toMatch(/awa@exemple|jeton|Confirmez/);
  });

  it('refuses a malformed message before queueing it', async () => {
    const queue = { add: vi.fn(async () => {}) };
    const mailer = createQueueMailer({ queue, secretBox: createSecretBox(randomBytes(32)) });

    await expect(mailer.send({ ...message, to: 'not-an-address' })).rejects.toThrow();
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe('mail processor (worker side)', () => {
  it('decrypts the job and hands the message to the transport, logging no content', async () => {
    const box = createSecretBox(randomBytes(32));
    /** @type {{ sealed: string } | undefined} */
    let queued;
    await createQueueMailer({
      queue: {
        add: async (_name, data) => {
          queued = data;
        },
      },
      secretBox: box,
    }).send(message);
    const transport = { send: vi.fn(async () => {}) };
    const { logger, logs } = createTestLogger();

    await createMailProcessor({ secretBox: box, transport, logger })({
      id: '42',
      data: /** @type {{ sealed: string }} */ (queued),
    });

    expect(transport.send).toHaveBeenCalledWith(message);
    expect(logs.text()).toContain('Email sent');
    expect(logs.text()).not.toMatch(/awa@exemple|jeton|Confirmez/);
  });

  it('fails the job when the payload was not sealed with the same key', async () => {
    const sealed = createSecretBox(randomBytes(32)).encrypt(JSON.stringify(message), 'mail:v1');
    const transport = { send: vi.fn(async () => {}) };
    const { logger } = createTestLogger();
    const process = createMailProcessor({
      secretBox: createSecretBox(randomBytes(32)),
      transport,
      logger,
    });

    await expect(process({ data: { sealed } })).rejects.toThrow();
    await expect(process({ data: {} })).rejects.toThrow(/sealed/);
    expect(transport.send).not.toHaveBeenCalled();
  });
});

describe('file transport', () => {
  it('writes each e-mail to its own file, readable by its owner only', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'alyora-mail-'));
    directories.push(directory);
    const outbox = path.join(directory, 'outbox');

    await createFileTransport({ directory: outbox }).send(message);
    await createFileTransport({ directory: outbox }).send(message);

    const files = await readdir(outbox);
    expect(files).toHaveLength(2);
    const first = path.join(outbox, files[0] ?? '');
    expect(JSON.parse(await readFile(first, 'utf8'))).toEqual(message);
    expect((await stat(first)).mode & 0o777).toBe(0o600);
    expect((await stat(outbox)).mode & 0o777).toBe(0o700);
  });
});
