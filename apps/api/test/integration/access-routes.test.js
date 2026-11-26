import { ROLE_KEYS, myPermissionsResponseSchema, permissionsOfRole } from '@alyora/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Collaborator } from '../../src/modules/access/models/collaborator.model.js';
import { createRedisPermissionCache } from '../../src/modules/access/services/permission-cache.js';
import {
  accessTokenFor,
  apiAs,
  seedEvent,
  unknownId,
  useAccessDatabase,
} from '../helpers/access.js';
import { buildTestApp, createTestLogger } from '../helpers/app.js';
import { closeTestRedis, connectTestRedis, uniqueRedisName } from '../helpers/redis.js';

useAccessDatabase();

/** @param {string} eventId */
const myPermissions = (eventId) => `/events/${eventId}/permissions/me`;

describe('GET /api/v1/events/:eventId/permissions/me', () => {
  it('returns the role and the permissions of each predefined role', async () => {
    const { app } = buildTestApp();
    const event = await seedEvent();

    for (const roleKey of ROLE_KEYS) {
      const response = await apiAs(app, event.actors[roleKey]).get(myPermissions(event.eventId));

      expect(response.status, roleKey).toBe(200);
      expect(myPermissionsResponseSchema.parse(response.body)).toEqual({
        eventId: event.eventId,
        role: { type: 'predefined', key: roleKey },
        permissions: [...permissionsOfRole(roleKey)],
      });
      expect(response.headers['cache-control']).toBe('no-store, no-transform');
    }
  });

  it('answers 404 to an account outside the event, exactly like an unknown event (forbidden access)', async () => {
    const { app } = buildTestApp();
    const a = await seedEvent({ label: 'a' });
    const b = await seedEvent({ label: 'b' });

    const unknown = await apiAs(app, a.actors.owner).get(myPermissions(unknownId()));
    const otherEvent = await apiAs(app, a.actors.owner).get(myPermissions(b.eventId));
    const outsider = await apiAs(app, b.actors.outsider).get(myPermissions(b.eventId));

    expect(unknown.status).toBe(404);
    for (const response of [otherEvent, outsider]) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual(unknown.body);
      expect(Object.keys(response.headers).sort()).toEqual(Object.keys(unknown.headers).sort());
    }
  });

  it('requires a verified, signed-in account and a valid event id', async () => {
    const { app } = buildTestApp();
    const event = await seedEvent();
    const unverified = await accessTokenFor(event.actors.owner.userId, { emailVerified: false });

    const anonymous = await request(app).get(`/api/v1${myPermissions(event.eventId)}`);
    const notVerified = await apiAs(app, { token: unverified }).get(myPermissions(event.eventId));
    const invalidId = await apiAs(app, event.actors.owner).get(myPermissions('{"$ne":null}'));

    expect(anonymous.status).toBe(401);
    expect(notVerified.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.code).toBe('VALIDATION_ERROR');
  });

  it('is documented in the OpenAPI document', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/v1/docs');

    expect(Object.keys(response.body.paths)).toContain('/api/v1/events/{eventId}/permissions/me');
  });
});

describe('permissions cached in a real Redis', () => {
  /** @type {import('ioredis').Redis} */
  let redis;

  beforeAll(async () => {
    redis = await connectTestRedis();
  });

  afterAll(async () => {
    await closeTestRedis(redis);
  });

  it('stop at once after a revocation followed by its invalidation, and follow a role change', async () => {
    const permissionCache = createRedisPermissionCache({
      redis,
      logger: createTestLogger().logger,
      prefix: uniqueRedisName('perm-routes'),
    });
    const { app } = buildTestApp({ permissionCache });
    const event = await seedEvent();
    const { userId, collaboratorId } = event.actors.reader;
    const reader = apiAs(app, event.actors.reader);
    const key = { eventId: event.eventId, userId };
    expect((await reader.get(myPermissions(event.eventId))).body.role.key).toBe('reader');

    await Collaborator.updateOne(
      { _id: collaboratorId, eventId: event.eventId },
      { roleKey: 'editor' },
    );
    await permissionCache.invalidate([key]);
    expect((await reader.get(myPermissions(event.eventId))).body.role.key).toBe('editor');

    await Collaborator.updateOne(
      { _id: collaboratorId, eventId: event.eventId },
      { status: 'revoked' },
    );
    await permissionCache.invalidate([key]);
    expect((await reader.get(myPermissions(event.eventId))).status).toBe(404);
  });
});
