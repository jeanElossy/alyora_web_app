import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WorkerConfigError, loadWorkerConfig } from './config.js';

const KEY = randomBytes(32).toString('base64');

/** @param {Record<string, string | undefined>} env */
function issuesOf(env) {
  try {
    loadWorkerConfig(env);
  } catch (error) {
    if (error instanceof WorkerConfigError) {
      return error.issues;
    }
    throw error;
  }
  throw new Error('loadWorkerConfig() was expected to throw');
}

describe('loadWorkerConfig', () => {
  it('applies and reports the defaults in development, with the file transport', () => {
    const { config, defaultsApplied } = loadWorkerConfig({
      NODE_ENV: 'development',
      REDIS_URL: 'redis://localhost:6379',
      DATA_ENCRYPTION_KEY: KEY,
    });

    expect(config).toMatchObject({
      concurrency: 5,
      email: { transport: 'file', outboxDir: '.mail-outbox' },
    });
    expect(config.dataEncryptionKey).toEqual(Buffer.from(KEY, 'base64'));
    expect(defaultsApplied.sort()).toEqual(
      ['EMAIL_TRANSPORT', 'LOG_LEVEL', 'MAIL_OUTBOX_DIR', 'WORKER_CONCURRENCY'].sort(),
    );
  });

  it('requires the encryption key and Redis in every environment', () => {
    expect(
      issuesOf({ NODE_ENV: 'development' })
        .map((issue) => issue.variable)
        .sort(),
    ).toEqual(['DATA_ENCRYPTION_KEY', 'REDIS_URL']);
  });

  it('refuses the file transport in production: no provider is set up yet', () => {
    const issues = issuesOf({
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      REDIS_URL: 'rediss://redis.example.net:6380',
      WORKER_CONCURRENCY: '5',
      DATA_ENCRYPTION_KEY: KEY,
      EMAIL_TRANSPORT: 'file',
      MAIL_OUTBOX_DIR: '/tmp/outbox',
    });

    expect(issues.map((issue) => issue.variable)).toEqual(['EMAIL_TRANSPORT']);
  });

  it('gives no default in production, and never reports a value', () => {
    const issues = issuesOf({ NODE_ENV: 'production', DATA_ENCRYPTION_KEY: 'not-a-key' });

    expect(issues.map((issue) => issue.variable)).toEqual(
      expect.arrayContaining(['LOG_LEVEL', 'REDIS_URL', 'WORKER_CONCURRENCY', 'EMAIL_TRANSPORT']),
    );
    expect(JSON.stringify(issues)).not.toContain('not-a-key');
  });
});
