import { PERMISSION_CACHE_TTL_SECONDS, permissionsOfRole } from '@alyora/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestLogger } from '../../../../test/helpers/app.js';
import {
  closeTestRedis,
  connectTestRedis,
  uniqueRedisName,
} from '../../../../test/helpers/redis.js';
import { createRedisPermissionCache } from './permission-cache.js';

/** @type {import('ioredis').Redis[]} */
const clients = [];

beforeAll(async () => {
  // Deux connexions distinctes, comme deux instances de l'API qui partagent Redis.
  clients.push(await connectTestRedis(), await connectTestRedis());
});

afterAll(async () => {
  await Promise.all(clients.map((client) => closeTestRedis(client)));
});

const KEY = Object.freeze({
  eventId: '6b0790c7ff6f6a3544c1b7bb',
  userId: '6b0790c7ff6f6a3544c1b7bc',
});

/**
 * @param {import('@alyora/shared').RoleKey} roleKey
 * @returns {import('../../../lib/auth/require-permission.js').EventAccess}
 */
const accessAs = (roleKey) => ({
  eventId: KEY.eventId,
  organizationId: '6b0790c7ff6f6a3544c1b7bd',
  collaboratorId: '6b0790c7ff6f6a3544c1b7be',
  role: { type: 'predefined', key: roleKey },
  permissions: permissionsOfRole(roleKey),
});

/** Deux instances du cache sur le même préfixe, chacune avec sa connexion. */
function createInstances() {
  const prefix = uniqueRedisName('perm');
  const { logger, logs } = createTestLogger();
  const [first, second] = /** @type {[import('ioredis').Redis, import('ioredis').Redis]} */ (
    clients
  );
  return {
    prefix,
    logs,
    first: createRedisPermissionCache({ redis: first, logger, prefix }),
    second: createRedisPermissionCache({ redis: second, logger, prefix }),
  };
}

/** Une promesse que le test résout quand il le décide. */
function deferred() {
  /** @type {(value: any) => void} */
  let resolve = () => {};
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Redis permission cache', () => {
  it('serves a granted access from Redis to every instance, for at most 60 seconds', async () => {
    const { first, second, prefix } = createInstances();
    const load = vi.fn(async () => accessAs('editor'));

    const loaded = await first.get(KEY, load);
    const cached = await second.get(KEY, load);

    expect(cached).toEqual(loaded);
    expect(Object.isFrozen(cached?.permissions)).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    const [client] = clients;
    const [entryKey] = (await client?.keys(`${prefix}:v1:*`)) ?? [];
    const ttl = await client?.ttl(/** @type {string} */ (entryKey));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(PERMISSION_CACHE_TTL_SECONDS);
  });

  it('never caches a refusal', async () => {
    const { first } = createInstances();
    const load = vi.fn(async () => null);

    expect(await first.get(KEY, load)).toBeNull();
    expect(await first.get(KEY, load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reloads on every instance after an invalidation by any instance', async () => {
    const { first, second } = createInstances();
    await first.get(KEY, async () => accessAs('admin'));

    await second.invalidate([KEY]);

    const load = vi.fn(async () => accessAs('reader'));
    expect(await first.get(KEY, load)).toMatchObject({ role: { key: 'reader' } });
    expect(load).toHaveBeenCalledOnce();
  });

  it('never lets a slow read put back an access revoked while it was reading (race)', async () => {
    const { first, second } = createInstances();
    const gate = deferred();
    const started = deferred();

    // Une requête lit MongoDB avant la révocation, et répond après elle.
    const slowRead = first.get(KEY, async () => {
      started.resolve(undefined);
      await gate.promise;
      return accessAs('admin');
    });
    await started.promise;
    await second.invalidate([KEY]);
    gate.resolve(undefined);
    expect(await slowRead).toMatchObject({ role: { key: 'admin' } });

    // La requête suivante ne voit pas cet accès périmé : elle relit MongoDB.
    const load = vi.fn(async () => null);
    expect(await second.get(KEY, load)).toBeNull();
    expect(load).toHaveBeenCalledOnce();
  });

  it('keeps reads concurrent with each other consistent (race)', async () => {
    const { first, second } = createInstances();
    const load = vi.fn(async () => accessAs('reader'));

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) => (index % 2 ? first : second).get(KEY, load)),
    );

    expect(new Set(results.map((result) => JSON.stringify(result))).size).toBe(1);
    await first.invalidate([KEY]);
    const reload = vi.fn(async () => null);
    expect(await second.get(KEY, reload)).toBeNull();
  });

  it('treats an unreadable or foreign entry as a miss', async () => {
    const { first, prefix } = createInstances();
    const [client] = clients;
    await first.get(KEY, async () => accessAs('reader'));
    const [entryKey] = (await client?.keys(`${prefix}:v1:*`)) ?? [];

    for (const corrupted of [
      '{not json',
      JSON.stringify({ ...accessAs('admin'), eventId: '6b0790c7ff6f6a3544c1b7bf' }),
      JSON.stringify({ ...accessAs('admin'), permissions: ['guests:delete'] }),
    ]) {
      await client?.set(/** @type {string} */ (entryKey), corrupted);
      const load = vi.fn(async () => accessAs('reader'));
      expect(await first.get(KEY, load)).toMatchObject({ role: { key: 'reader' } });
      expect(load).toHaveBeenCalledOnce();
    }
  });

  it('does nothing for an empty invalidation', async () => {
    const { first, logs } = createInstances();

    await first.invalidate([]);

    expect(logs.entries()).toEqual([]);
  });
});

describe('Redis permission cache without Redis', () => {
  it('resolves from MongoDB, and reports a failed invalidation as critical without failing', async () => {
    const broken = await connectTestRedis();
    broken.disconnect();
    const { logger, logs } = createTestLogger();
    const cache = createRedisPermissionCache({
      redis: broken,
      logger,
      prefix: uniqueRedisName('down'),
    });
    const load = vi.fn(async () => accessAs('reader'));

    expect(await cache.get(KEY, load)).toMatchObject({ role: { key: 'reader' } });
    await expect(cache.invalidate([KEY])).resolves.toBeUndefined();

    expect(load).toHaveBeenCalledOnce();
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({ level: 'warn', event: 'access.permission_cache_unavailable' }),
    );
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({
        level: 'error',
        event: 'access.permission_cache_invalidation_failed',
        severity: 'critical',
        count: 1,
      }),
    );
  });

  it('still answers when Redis fails between the read and the write', async () => {
    const [client] = /** @type {[import('ioredis').Redis]} */ (clients);
    const { logger, logs } = createTestLogger();
    const failing = Object.create(client, {
      eval: { value: async () => Promise.reject(new Error('Redis went away')) },
    });
    const cache = createRedisPermissionCache({
      redis: failing,
      logger,
      prefix: uniqueRedisName('eval'),
    });

    expect(await cache.get(KEY, async () => accessAs('reader'))).toMatchObject({
      role: { key: 'reader' },
    });
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({ event: 'access.permission_cache_unavailable' }),
    );
  });
});
