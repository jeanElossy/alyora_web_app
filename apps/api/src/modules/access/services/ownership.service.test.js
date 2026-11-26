import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  addCollaborator,
  contextAs,
  createTestAccessServices,
  createTestUser,
  seedEvent,
  unknownId,
  useAccessDatabase,
} from '../../../../test/helpers/access.js';
import { AuditLog } from '../../../lib/audit/audit-log.model.js';
import { Collaborator } from '../models/collaborator.model.js';

useAccessDatabase();

/** @param {string} eventId */
const ownersOf = (eventId) =>
  Collaborator.find({ eventId, status: 'active', roleKey: 'owner' }).distinct('userId');

describe('ownership transfer', () => {
  it('makes the target owner and the former owner admin, records it and refreshes the cache', async () => {
    const { services, resolver } = createTestAccessServices();
    const event = await seedEvent();
    const { owner, editor } = event.actors;
    await resolver.resolve({ eventId: event.eventId, userId: owner.userId });

    const result = await services.ownership.transfer(contextAs(event, 'owner'), {
      collaboratorId: String(editor.collaboratorId),
    });

    expect(result).toEqual({
      ownerCollaboratorId: editor.collaboratorId,
      formerOwnerCollaboratorId: owner.collaboratorId,
    });

    expect((await ownersOf(event.eventId)).map(String)).toEqual([editor.userId]);
    expect(await resolver.resolve({ eventId: event.eventId, userId: owner.userId })).toMatchObject({
      role: { type: 'predefined', key: 'admin' },
    });
    expect(await AuditLog.findOne({ eventId: event.eventId }).lean()).toMatchObject({
      action: 'ownership.transferred',
      targetType: 'event',
      actorId: new mongoose.Types.ObjectId(owner.userId),
      before: { ownerCollaboratorId: owner.collaboratorId },
      after: { ownerCollaboratorId: editor.collaboratorId },
    });
  });

  it('turns a collaborator with an explicit list into a plain owner', async () => {
    const { services } = createTestAccessServices();
    const event = await seedEvent();
    const userId = await createTestUser();
    const collaboratorId = await addCollaborator({ ...event, userId, permissions: ['event:read'] });

    await services.ownership.transfer(contextAs(event, 'owner'), { collaboratorId });

    const stored = await Collaborator.findOne({
      _id: collaboratorId,
      eventId: event.eventId,
    }).lean();
    expect(stored).toMatchObject({ roleKey: 'owner', customRoleId: null });
    expect(stored?.permissions).toBeUndefined();
  });

  it('is reserved to the owner, toward another active collaborator of the same event', async () => {
    const { services } = createTestAccessServices();
    const event = await seedEvent();
    const other = await seedEvent({ label: 'other' });
    const revoked = await addCollaborator({
      ...event,
      userId: await createTestUser(),
      roleKey: 'reader',
      status: 'revoked',
    });
    const { actors } = event;

    for (const [actor, collaboratorId, code] of /** @type {const} */ ([
      ['admin', String(actors.editor.collaboratorId), 'FORBIDDEN'],
      ['owner', String(actors.owner.collaboratorId), 'COLLABORATOR_CONFLICT'],
      ['owner', revoked, 'NOT_FOUND'],
      ['owner', String(other.actors.admin.collaboratorId), 'NOT_FOUND'],
      ['owner', unknownId(), 'NOT_FOUND'],
    ])) {
      await expect(
        services.ownership.transfer(contextAs(event, actor), { collaboratorId }),
      ).rejects.toMatchObject({ code });
    }
    expect((await ownersOf(event.eventId)).map(String)).toEqual([actors.owner.userId]);
    expect(await AuditLog.countDocuments({ eventId: event.eventId })).toBe(0);
  });
});
