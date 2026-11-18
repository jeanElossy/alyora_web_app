import { MemoryStore } from 'express-rate-limit';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { pingMongo } from '../../src/lib/db/mongo.js';
import { pingRedis } from '../../src/lib/redis/redis.js';
import { buildTestApp } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/db.js';
import { createFakeRedis } from '../helpers/fake-redis.js';

useTestDatabase();

/** La vraie application, qui vérifie le vrai replica set de test et un faux Redis. */
function buildApp() {
  const redis = createFakeRedis();
  const { app, logs } = buildTestApp({
    readinessChecks: {
      mongo: () => pingMongo(mongoose.connection),
      redis: () => pingRedis(redis),
    },
    rateLimitStore: new MemoryStore(),
  });
  return { app, logs, redis };
}

describe('GET /health', () => {
  it('answers 200 while the process is alive, even when dependencies are down', async () => {
    const { app, redis } = buildApp();
    redis.available = false;

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('GET /ready', () => {
  it('answers 200 when MongoDB and Redis are reachable', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready', checks: { mongo: 'up', redis: 'up' } });
  });

  it('answers 503 when Redis is unreachable, without revealing why', async () => {
    const { app, redis, logs } = buildApp();
    redis.available = false;

    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'not_ready', checks: { mongo: 'up', redis: 'down' } });
    expect(logs.entries().some((entry) => entry.check === 'redis')).toBe(true);
  });

  it('answers 503 when MongoDB is disconnected', async () => {
    const { app } = buildApp();
    const { db } = mongoose.connection;
    // Simule une connexion perdue sans fermer la connexion de test partagée.
    Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

    try {
      const response = await request(app).get('/ready');

      expect(response.status).toBe(503);
      expect(response.body.checks).toEqual({ mongo: 'down', redis: 'up' });
    } finally {
      // Rétablit l'accesseur du prototype.
      Reflect.deleteProperty(mongoose.connection, 'readyState');
    }
    expect(mongoose.connection.db).toBe(db);
  });
});

describe('probes', () => {
  it('are never rate limited nor logged per request', async () => {
    const { app, logs } = buildApp();

    const responses = await Promise.all(
      Array.from({ length: 30 }, () => request(app).get('/health')),
    );

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(responses[0]?.headers).not.toHaveProperty('ratelimit');
    expect(logs.entries().filter((entry) => entry.msg === 'request completed')).toHaveLength(0);
  });
});
