import { errorResponseSchema } from '@alyora/shared';
import { MemoryStore } from 'express-rate-limit';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildPipelineApp } from '../../../test/helpers/app.js';
import { createFakeRedis } from '../../../test/helpers/fake-redis.js';
import {
  GLOBAL_RATE_LIMIT,
  createRateLimiter,
  createRedisStore,
  globalRateLimiter,
} from './rate-limit.js';

/** Stockage dont le serveur est en panne. @returns {import('express-rate-limit').Store} */
function brokenStore() {
  return {
    increment: async () => {
      throw new Error('Redis unreachable');
    },
    decrement: async () => {},
    resetKey: async () => {},
  };
}

/**
 * @param {(logger: import('pino').Logger) => import('express').RequestHandler} limiterFactory
 */
function buildApp(limiterFactory) {
  return buildPipelineApp((app, logger) => {
    app.get('/limited', limiterFactory(logger), (_req, res) => {
      res.json({ ok: true });
    });
  });
}

describe('createRateLimiter', () => {
  it('answers RATE_LIMITED in the normalized format once the limit is reached', async () => {
    const { app } = buildApp((logger) =>
      createRateLimiter({
        name: 'test',
        windowMs: 60_000,
        limit: 2,
        store: new MemoryStore(),
        logger,
        failOpen: false,
      }),
    );

    const first = await request(app).get('/limited');
    await request(app).get('/limited');
    const third = await request(app).get('/limited');

    expect(first.status).toBe(200);
    expect(first.headers.ratelimit).toContain('r=1');
    expect(third.status).toBe(429);
    expect(errorResponseSchema.parse(third.body)).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many requests',
    });
    expect(third.headers['retry-after']).toBeDefined();
  });

  it('fails closed when asked to and the store is down', async () => {
    const { app } = buildApp((logger) =>
      createRateLimiter({
        name: 'strict',
        windowMs: 60_000,
        limit: 5,
        store: brokenStore(),
        logger,
        failOpen: false,
      }),
    );

    const response = await request(app).get('/limited');

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('INTERNAL_ERROR');
  });
});

describe('globalRateLimiter', () => {
  it('allows the documented volume per IP', () => {
    expect(GLOBAL_RATE_LIMIT).toEqual({ windowMs: 900_000, limit: 1000 });
  });

  it('fails open: requests pass when the store is down, and the error is logged', async () => {
    const { app, logs } = buildApp((logger) => globalRateLimiter({ store: brokenStore(), logger }));

    const response = await request(app).get('/limited');

    expect(response.status).toBe(200);
    expect(logs.entries().some((entry) => entry.level === 'error' && /store/.test(entry.msg))).toBe(
      true,
    );
  });
});

describe('createRedisStore', () => {
  it('loads its atomic scripts, then increments through the Redis client under its prefix', async () => {
    const redis = createFakeRedis();
    const store = createRedisStore(redis, 'global');
    const limiterOptions = /** @type {import('express-rate-limit').Options} */ (
      /** @type {unknown} */ ({ windowMs: 60_000 })
    );

    await store.init?.(limiterOptions);
    const result = await store.increment('203.0.113.7');

    const commandNames = redis.commands.map(([command, subcommand]) => `${command} ${subcommand}`);
    expect(commandNames.filter((name) => name === 'SCRIPT LOAD')).toHaveLength(2);
    const increment = redis.commands.find(([command]) => command === 'EVALSHA');
    expect(increment).toContain('rl:global:203.0.113.7');
    expect(result.totalHits).toBe(1);
  });
});
