import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../../test/helpers/app.js';
import { checkReadiness } from './readiness.js';

describe('checkReadiness', () => {
  it('is ready when every check succeeds', async () => {
    const { logger } = createTestLogger();

    const report = await checkReadiness(
      { mongo: async () => {}, redis: async () => 'PONG' },
      { logger },
    );

    expect(report).toEqual({ ready: true, checks: { mongo: 'up', redis: 'up' } });
  });

  it('is not ready when one check fails, and logs why without exposing it', async () => {
    const { logger, logs } = createTestLogger();

    const report = await checkReadiness(
      {
        mongo: async () => {},
        redis: async () => {
          throw new Error('connect ECONNREFUSED 10.0.0.5:6379');
        },
      },
      { logger },
    );

    expect(report).toEqual({ ready: false, checks: { mongo: 'up', redis: 'down' } });
    expect(JSON.stringify(report)).not.toContain('ECONNREFUSED');
    expect(logs.entries()[0]).toMatchObject({
      level: 'warn',
      check: 'redis',
      err: { message: 'connect ECONNREFUSED 10.0.0.5:6379' },
    });
  });

  it('marks a check that hangs as down after the timeout', async () => {
    const { logger, logs } = createTestLogger();

    const started = Date.now();
    const report = await checkReadiness({ mongo: () => delay(1_000) }, { logger, timeoutMs: 20 });

    expect(Date.now() - started).toBeLessThan(500);
    expect(report).toEqual({ ready: false, checks: { mongo: 'down' } });
    expect(logs.entries()[0]?.err.message).toBe('mongo check timed out');
  });

  it('runs the checks in parallel', async () => {
    const { logger } = createTestLogger();

    const started = Date.now();
    await checkReadiness(
      { a: () => delay(100), b: () => delay(100), c: () => delay(100) },
      { logger },
    );

    expect(Date.now() - started).toBeLessThan(250);
  });
});
