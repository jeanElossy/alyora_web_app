import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSecretBox } from '../../src/lib/crypto/secret-box.js';
import { createFileTransport, createMailProcessor } from '../../src/lib/mail/mail-processor.js';
import {
  MAIL_JOB_OPTIONS,
  MAIL_QUEUE_NAME,
  createQueueMailer,
} from '../../src/lib/mail/mail-queue.js';
import { createTestLogger } from '../helpers/app.js';
import { testRedisUrl } from '../helpers/redis.js';

/** @type {Redis} */
let connection;
/** @type {string} */
let outbox;

beforeAll(async () => {
  connection = new Redis(testRedisUrl(), { maxRetriesPerRequest: null });
  outbox = await mkdtemp(path.join(tmpdir(), 'alyora-outbox-'));
});

afterAll(async () => {
  await connection.quit();
  await rm(outbox, { recursive: true, force: true });
});

describe('e-mail pipeline: API queue → Redis → worker → transport', () => {
  it('delivers an e-mail that crossed Redis encrypted', async () => {
    // Préfixe unique : les fichiers de test qui partagent Redis ne voient pas ces jobs.
    const prefix = `test-mail-${randomUUID()}`;
    const key = randomBytes(32);
    const queue = new Queue(MAIL_QUEUE_NAME, {
      connection,
      prefix,
      defaultJobOptions: { ...MAIL_JOB_OPTIONS },
    });
    const { logger, logs } = createTestLogger();
    const worker = new Worker(
      MAIL_QUEUE_NAME,
      createMailProcessor({
        secretBox: createSecretBox(key),
        transport: createFileTransport({ directory: outbox }),
        logger,
      }),
      { connection: connection.duplicate(), prefix },
    );
    const done = new Promise((resolve) => worker.once('completed', resolve));
    const message = {
      to: 'awa@exemple.ci',
      subject: 'Confirmez votre adresse e-mail',
      text: 'http://localhost:5173/verifier-email#jeton=abc',
      html: '<p>Lien</p>',
    };

    await createQueueMailer({ queue, secretBox: createSecretBox(key) }).send(message);
    // Ce que Redis garde du job, pendant son attente : rien de lisible.
    const stored = JSON.stringify(await connection.hgetall(`${prefix}:${MAIL_QUEUE_NAME}:1`));
    expect(stored).not.toMatch(/awa@exemple|jeton|Confirmez/);
    await done;

    const [file] = await readdir(outbox);
    expect(JSON.parse(await readFile(path.join(outbox, file ?? ''), 'utf8'))).toEqual(message);
    expect(logs.text()).not.toMatch(/awa@exemple|jeton/);
    // Réussi, le job est supprimé de Redis.
    expect(await queue.getJobCounts('completed', 'waiting', 'active')).toEqual({
      completed: 0,
      waiting: 0,
      active: 0,
    });
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
  });
});
