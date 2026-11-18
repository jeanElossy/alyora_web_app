import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import { createTestLogger } from '../../../test/helpers/app.js';
import { startFakeRedisServer } from '../../../test/helpers/fake-redis-server.js';
import { createFakeRedis } from '../../../test/helpers/fake-redis.js';
import { REDIS_OPTIONS, closeRedis, connectRedis, createRedisClient, pingRedis } from './redis.js';

/** @typedef {import('ioredis').Redis} Redis */

/**
 * @param {string} status
 * @param {() => Promise<unknown>} quit
 */
function clientDouble(status, quit) {
  const double = { status, quit: vi.fn(quit), disconnect: vi.fn() };
  return { double, client: /** @type {Redis} */ (/** @type {unknown} */ (double)) };
}

describe('createRedisClient and connectRedis', () => {
  it('rejects quickly when Redis is unreachable, logs the error and stops retrying', async () => {
    const { logger, logs } = createTestLogger();
    const client = createRedisClient({ url: 'redis://:Pa55word@127.0.0.1:1', logger });

    await expect(connectRedis(client)).rejects.toThrow();

    const attempts = () => logs.entries().filter((entry) => entry.msg === 'Redis connection error');
    expect(attempts()).toHaveLength(1);
    expect(logs.text()).not.toContain('Pa55word');
    // La première nouvelle tentative aurait lieu après 200 ms : aucune ne doit avoir lieu.
    await delay(600);
    expect(attempts()).toHaveLength(1);
  });

  it('does not connect before connectRedis is called', () => {
    const { logger } = createTestLogger();

    const client = createRedisClient({ url: 'redis://127.0.0.1:1', logger });

    expect(client.status).toBe('wait');
    client.disconnect();
  });

  it('logs the ready and reconnecting events', () => {
    const { logger, logs } = createTestLogger();
    const client = createRedisClient({ url: 'redis://127.0.0.1:1', logger });

    client.emit('ready');
    client.emit('reconnecting', 400);

    expect(logs.entries().map((entry) => [entry.level, entry.msg])).toEqual([
      ['info', 'Redis ready'],
      ['warn', 'Redis reconnecting'],
    ]);
    client.disconnect();
  });
});

describe('a Redis that stops answering', () => {
  it('makes a command fail within the command timeout instead of hanging', async () => {
    const server = await startFakeRedisServer();
    const { logger } = createTestLogger();
    const client = createRedisClient({ url: server.url, logger });
    try {
      await connectRedis(client);
      await expect(pingRedis(client)).resolves.toBeUndefined();

      server.hung = true;
      const started = Date.now();
      await expect(client.call('INCR', 'rl:global:203.0.113.7')).rejects.toThrow(
        'Command timed out',
      );

      expect(Date.now() - started).toBeLessThan(REDIS_OPTIONS.commandTimeout + 400);
    } finally {
      client.disconnect();
      await server.close();
    }
  });
});

describe('pingRedis', () => {
  it('resolves when Redis answers and rejects when it does not', async () => {
    const redis = createFakeRedis();

    await expect(pingRedis(redis)).resolves.toBeUndefined();
    redis.available = false;
    await expect(pingRedis(redis)).rejects.toThrow('Redis unreachable');
  });
});

describe('closeRedis', () => {
  it('sends QUIT to a ready connection', async () => {
    const { double, client } = clientDouble('ready', async () => 'OK');

    await closeRedis(client);

    expect(double.quit).toHaveBeenCalledOnce();
    expect(double.disconnect).not.toHaveBeenCalled();
  });

  it('cuts the connection when QUIT fails', async () => {
    const { double, client } = clientDouble('ready', async () => {
      throw new Error('Connection is closed.');
    });

    await closeRedis(client);

    expect(double.disconnect).toHaveBeenCalledOnce();
  });

  it('cuts a connection that is not ready without waiting for it', async () => {
    const { double, client } = clientDouble('reconnecting', async () => 'OK');

    await closeRedis(client);

    expect(double.quit).not.toHaveBeenCalled();
    expect(double.disconnect).toHaveBeenCalledOnce();
  });

  it('does nothing on a connection that is already closed', async () => {
    const { double, client } = clientDouble('end', async () => 'OK');

    await closeRedis(client);

    expect(double.quit).not.toHaveBeenCalled();
    expect(double.disconnect).not.toHaveBeenCalled();
  });
});
