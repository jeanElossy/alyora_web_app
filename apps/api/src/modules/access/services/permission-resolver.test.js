import { PERMISSIONS, permissionsOfRole } from '@alyora/shared';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  addCollaborator,
  createTestUser,
  seedEvent,
  useAccessDatabase,
} from '../../../../test/helpers/access.js';
import { createTestLogger } from '../../../../test/helpers/app.js';
import { createMemoryPermissionCache } from '../../../../test/helpers/permission-cache.js';
import { Collaborator } from '../models/collaborator.model.js';
import { CustomRole } from '../models/custom-role.model.js';
import { createPermissionResolver } from './permission-resolver.js';

useAccessDatabase();

function createResolver() {
  const { logger, logs } = createTestLogger();
  const cache = createMemoryPermissionCache();
  return { resolver: createPermissionResolver({ cache, logger }), logs, cache };
}

/**
 * @param {string} organizationId
 * @param {import('@alyora/shared').Permission[]} permissions
 * @param {{ deletedAt?: Date | null }} [options]
 */
async function createCustomRole(organizationId, permissions, { deletedAt = null } = {}) {
  const role = await CustomRole.create({
    organizationId,
    name: `Rôle ${new mongoose.Types.ObjectId()}`,
    permissions,
    createdBy: new mongoose.Types.ObjectId(),
    deletedAt,
  });
  return String(role._id);
}

describe('permission resolver', () => {
  it('resolves each predefined role to its permission set', async () => {
    const { resolver } = createResolver();
    const event = await seedEvent();

    for (const roleKey of /** @type {const} */ ([
      'owner',
      'admin',
      'editor',
      'reader',
      'checkin_agent',
    ])) {
      const actor = event.actors[roleKey];
      expect(await resolver.resolve({ eventId: event.eventId, userId: actor.userId })).toEqual({
        eventId: event.eventId,
        organizationId: event.organizationId,
        collaboratorId: actor.collaboratorId,
        role: { type: 'predefined', key: roleKey },
        permissions: permissionsOfRole(roleKey),
      });
    }
  });

  it('gives nothing to an account outside the event, or on another event', async () => {
    const { resolver } = createResolver();
    const a = await seedEvent({ label: 'a' });
    const b = await seedEvent({ label: 'b' });

    expect(
      await resolver.resolve({ eventId: a.eventId, userId: a.actors.outsider.userId }),
    ).toBeNull();
    expect(
      await resolver.resolve({ eventId: b.eventId, userId: a.actors.owner.userId }),
    ).toBeNull();
    expect(
      await resolver.resolve({
        eventId: new mongoose.Types.ObjectId().toString(),
        userId: a.actors.owner.userId,
      }),
    ).toBeNull();
  });

  it('gives nothing to a revoked collaborator', async () => {
    const { resolver } = createResolver();
    const event = await seedEvent();
    const userId = await createTestUser();
    await addCollaborator({ ...event, userId, roleKey: 'admin', status: 'revoked' });

    expect(await resolver.resolve({ eventId: event.eventId, userId })).toBeNull();
  });

  it('resolves a custom role of the event organization, without unknown permissions', async () => {
    const { resolver, logs } = createResolver();
    const event = await seedEvent();
    const customRoleId = await createCustomRole(event.organizationId, [
      'guests:write',
      'event:read',
    ]);
    // Une permission retirée du catalogue depuis l'enregistrement du rôle.
    await CustomRole.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(customRoleId) },
      /** @type {any} Une valeur hors catalogue, écrite sans passer par le modèle. */ ({
        $push: { permissions: 'guests:delete' },
      }),
    );
    const userId = await createTestUser();
    await addCollaborator({ ...event, userId, customRoleId });

    expect(await resolver.resolve({ eventId: event.eventId, userId })).toMatchObject({
      role: { type: 'custom', customRoleId },
      permissions: ['event:read', 'guests:write'],
    });
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({ event: 'access.unknown_permissions', count: 1, customRoleId }),
    );
  });

  it('never applies a custom role of another organization, nor a deleted one', async () => {
    const { resolver, logs } = createResolver();
    const event = await seedEvent();
    const other = await seedEvent({ label: 'other' });
    const foreignRoleId = await createCustomRole(other.organizationId, [...PERMISSIONS]);
    const deletedRoleId = await createCustomRole(event.organizationId, [...PERMISSIONS], {
      deletedAt: new Date(),
    });
    const foreign = await createTestUser();
    const deleted = await createTestUser();
    await addCollaborator({ ...event, userId: foreign, customRoleId: foreignRoleId });
    await addCollaborator({ ...event, userId: deleted, customRoleId: deletedRoleId });

    for (const [userId, customRoleId] of [
      [foreign, foreignRoleId],
      [deleted, deletedRoleId],
    ]) {
      expect(await resolver.resolve({ eventId: event.eventId, userId })).toMatchObject({
        role: { type: 'custom', customRoleId },
        permissions: [],
      });
    }
    expect(
      logs.entries().filter((entry) => entry.event === 'access.custom_role_missing'),
    ).toHaveLength(2);
  });

  it('resolves an explicit list in catalog order, and ignores an unknown role key', async () => {
    const { resolver, logs } = createResolver();
    const event = await seedEvent();
    const explicit = await createTestUser();
    const unknownRole = await createTestUser();
    await addCollaborator({
      ...event,
      userId: explicit,
      permissions: ['checkin:scan', 'event:read'],
    });
    const collaboratorId = await addCollaborator({
      ...event,
      userId: unknownRole,
      roleKey: 'reader',
    });
    await Collaborator.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(collaboratorId) },
      { $set: { roleKey: 'superadmin' } },
    );

    expect(await resolver.resolve({ eventId: event.eventId, userId: explicit })).toMatchObject({
      role: { type: 'explicit' },
      permissions: ['event:read', 'checkin:scan'],
    });
    expect(await resolver.resolve({ eventId: event.eventId, userId: unknownRole })).toMatchObject({
      role: { type: 'explicit' },
      permissions: [],
    });
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({ event: 'access.unknown_role', collaboratorId }),
    );
  });

  it('serves the cached access until it is invalidated', async () => {
    const { resolver, cache } = createResolver();
    const event = await seedEvent();
    const { userId, collaboratorId } = event.actors.reader;
    const key = { eventId: event.eventId, userId };
    await resolver.resolve(key);

    await Collaborator.updateOne(
      { _id: collaboratorId, eventId: event.eventId },
      { status: 'revoked' },
    );

    expect(await resolver.resolve(key)).not.toBeNull();
    await resolver.invalidate([key]);
    expect(await resolver.resolve(key)).toBeNull();
    expect(cache.size()).toBe(0);
  });
});

describe('collaborator model', () => {
  it('requires exactly one of roleKey, customRoleId and permissions', async () => {
    const event = await seedEvent();
    const userId = await createTestUser();
    const { eventId, organizationId } = event;
    const base = { eventId, organizationId, userId, acceptedAt: new Date() };

    await expect(Collaborator.create(base)).rejects.toThrow(/Exactly one/);
    await expect(
      Collaborator.create({ ...base, roleKey: 'reader', permissions: ['event:read'] }),
    ).rejects.toThrow(/Exactly one/);
    await expect(
      Collaborator.create({ ...base, permissions: /** @type {any} */ (['guests:delete']) }),
    ).rejects.toThrow();
    await expect(Collaborator.create({ ...base, permissions: [] })).resolves.toBeDefined();
  });

  it('allows a single active owner per event, and a single active access per account', async () => {
    const event = await seedEvent();

    await expect(
      addCollaborator({ ...event, userId: await createTestUser(), roleKey: 'owner' }),
    ).rejects.toMatchObject({ code: 11000 });
    await expect(
      addCollaborator({ ...event, userId: event.actors.reader.userId, roleKey: 'editor' }),
    ).rejects.toMatchObject({ code: 11000 });
    await expect(
      addCollaborator({
        ...event,
        userId: event.actors.reader.userId,
        roleKey: 'editor',
        status: 'revoked',
      }),
    ).resolves.toBeDefined();
  });
});
