import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startServer } from '../../src/bootstrap.js';
import { testMongoUri } from '../helpers/db.js';
import { createLogCapture } from '../helpers/log-capture.js';
import { MONGODB_TEST_VERSION } from '../setup/global-setup.js';
import { TEST_SECRETS } from '../helpers/app.js';

const SERVER_ENTRY = fileURLToPath(new URL('../../src/server.js', import.meta.url));
// Fausse valeur de test, cherchée dans la sortie pour prouver qu'elle n'y apparaît jamais.
const REDIS_PASSWORD = 'R3disS3cret-marker'; // gitleaks:allow

/**
 * Démarre l'API avec cet environnement, complété des secrets de test (tirés au hasard).
 *
 * @param {Record<string, string>} env
 */
function startWith(env) {
  const logs = createLogCapture();
  const exit = vi.fn();
  const processRef = new EventEmitter();
  const started = startServer({
    env: { ...TEST_SECRETS, ...env },
    exit,
    processRef,
    destination: logs.destination,
  });
  return { started, exit, logs };
}

describe('the API process', () => {
  it('refuses to start when an environment variable is missing, with a clear message', async () => {
    const outcome = await promisify(execFile)(process.execPath, [SERVER_ENTRY], {
      env: {
        PATH: process.env.PATH ?? '',
        NODE_ENV: 'production',
        REDIS_URL: `rediss://default:${REDIS_PASSWORD}@redis.example.net:6380`,
      },
      timeout: 15_000,
    }).catch((/** @type {{ code: number, stdout: string }} */ error) => error);

    expect(outcome).toMatchObject({ code: 1 });
    const output = /** @type {{ stdout: string }} */ (outcome).stdout;
    const fatal = JSON.parse(output.trim().split('\n').at(-1) ?? '{}');
    expect(fatal).toMatchObject({
      level: 'fatal',
      msg: 'Invalid environment configuration, refusing to start',
    });
    expect(fatal.issues.map((/** @type {{ variable: string }} */ issue) => issue.variable)).toEqual(
      expect.arrayContaining(['MONGODB_URI', 'PORT', 'CORS_ORIGINS', 'TRUST_PROXY']),
    );
    expect(output).not.toContain(REDIS_PASSWORD);
  });
});

describe('startServer', () => {
  /** @type {MongoMemoryServer} */
  let standalone;

  beforeAll(async () => {
    standalone = await MongoMemoryServer.create({ binary: { version: MONGODB_TEST_VERSION } });
  });

  afterAll(async () => {
    await standalone.stop();
  });

  it('refuses to start on a MongoDB that is not a replica set', async () => {
    const { started, exit, logs } = startWith({
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      MONGODB_URI: standalone.getUri('alyora'),
      REDIS_URL: 'redis://127.0.0.1:1',
    });

    await expect(started).resolves.toBeUndefined();
    expect(exit).toHaveBeenCalledWith(1);
    expect(logs.entries().find((entry) => entry.level === 'fatal')).toMatchObject({
      msg: 'API failed to start',
      err: { type: 'ReplicaSetRequiredError' },
    });
  });

  it('refuses to start when Redis is unreachable, after closing MongoDB', async () => {
    const { started, exit, logs } = startWith({
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      MONGODB_URI: testMongoUri('_startup'),
      REDIS_URL: `redis://:${REDIS_PASSWORD}@127.0.0.1:1`,
    });

    await expect(started).resolves.toBeUndefined();
    expect(exit).toHaveBeenCalledWith(1);
    const messages = logs.entries().map((entry) => entry.msg);
    expect(messages).toEqual(
      expect.arrayContaining(['MongoDB connected', 'API failed to start', 'Resource closed']),
    );
    expect(messages.indexOf('API failed to start')).toBeLessThan(
      messages.lastIndexOf('Resource closed'),
    );
    expect(logs.text()).not.toContain(REDIS_PASSWORD);
  });

  it('reports the non-production defaults it applied', async () => {
    const { started, logs } = startWith({
      NODE_ENV: 'development',
      MONGODB_URI: standalone.getUri('alyora'),
      REDIS_URL: 'redis://127.0.0.1:1',
    });

    await started;
    expect(logs.entries()[0]).toMatchObject({
      level: 'warn',
      msg: 'Non-production defaults applied',
      variables: expect.arrayContaining(['PORT', 'LOG_LEVEL']),
    });
  });

  it('refuses an invalid environment without throwing', async () => {
    const { started, exit, logs } = startWith({ NODE_ENV: 'staging' });

    await expect(started).resolves.toBeUndefined();
    expect(exit).toHaveBeenCalledWith(1);
    expect(logs.entries()[0]?.level).toBe('fatal');
  });
});
