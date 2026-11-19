import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRateLimiter, createRedisStore } from '../../src/lib/http/rate-limit.js';
import { buildPipelineApp } from '../helpers/app.js';
import { closeTestRedis, connectTestRedis, uniqueRedisName } from '../helpers/redis.js';

const LIMIT = 10;
const WINDOW_MS = 60_000;
/** Supertest se connecte en local : le rate limit compte donc ces requêtes sous 127.0.0.1. */
const CLIENT_IP = '127.0.0.1';

/** @type {import('ioredis').Redis[]} */
const clients = [];

beforeAll(async () => {
  // Deux connexions distinctes, comme deux instances de l'API derrière un load balancer.
  clients.push(await connectTestRedis(), await connectTestRedis());
});

afterAll(async () => {
  await Promise.all(clients.map((client) => closeTestRedis(client)));
});

/**
 * Une instance de l'API : la chaîne de middlewares de production, une limite stricte (qui
 * bloque si Redis échoue, pour qu'une erreur de stockage ne passe pas inaperçue) et une route.
 *
 * @param {import('ioredis').Redis} client
 * @param {string} name
 */
function buildInstance(client, name) {
  const { app } = buildPipelineApp((pipelineApp, logger) => {
    const limiter = createRateLimiter({
      name,
      windowMs: WINDOW_MS,
      limit: LIMIT,
      store: createRedisStore(client, name),
      logger,
      failOpen: false,
    });
    pipelineApp.get('/limited', limiter, (_req, res) => {
      res.json({ ok: true });
    });
  });
  return app;
}

/**
 * @param {import('express').Express} app
 * @param {number} count
 */
function sendConcurrently(app, count) {
  return Array.from({ length: count }, () => request(app).get('/limited'));
}

/** @param {Array<{ status: number }>} responses */
function countStatuses(responses) {
  /** @type {Record<number, number>} */
  const counts = {};
  for (const { status } of responses) {
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

describe('rate limit backed by a real Redis (race)', () => {
  it(`lets exactly ${LIMIT} of 50 concurrent requests through and counts all of them`, async () => {
    const [client] = /** @type {[import('ioredis').Redis]} */ (clients);
    const name = uniqueRedisName('race');
    const app = buildInstance(client, name);

    const responses = await Promise.all(sendConcurrently(app, 50));

    expect(countStatuses(responses)).toEqual({ 200: LIMIT, 429: 50 - LIMIT });
    expect(await client.get(`rl:${name}:${CLIENT_IP}`)).toBe('50');
  });

  it(`shares the counter between two API instances: ${LIMIT} requests pass in total`, async () => {
    const [first, second] = /** @type {[import('ioredis').Redis, import('ioredis').Redis]} */ (
      clients
    );
    const name = uniqueRedisName('instances');
    const instances = [buildInstance(first, name), buildInstance(second, name)];

    const responses = await Promise.all(instances.flatMap((app) => sendConcurrently(app, 25)));

    expect(countStatuses(responses)).toEqual({ 200: LIMIT, 429: 50 - LIMIT });
    expect(await first.get(`rl:${name}:${CLIENT_IP}`)).toBe('50');
  });

  it('keeps a single key per client, under its prefix, that expires with the window', async () => {
    const [client] = /** @type {[import('ioredis').Redis]} */ (clients);
    const name = uniqueRedisName('key');
    const app = buildInstance(client, name);

    await Promise.all(sendConcurrently(app, 3));

    // KEYS bloque Redis le temps du parcours : acceptable sur le Redis de test seulement.
    expect(await client.keys(`rl:${name}:*`)).toEqual([`rl:${name}:${CLIENT_IP}`]);
    const ttl = await client.pttl(`rl:${name}:${CLIENT_IP}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(WINDOW_MS);
  });
});
