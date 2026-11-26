import { permissionsOfRole } from '@alyora/shared';
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
import { CustomRole } from '../models/custom-role.model.js';

useAccessDatabase();

describe('collaborator service: list', () => {
  it('lists the active collaborators of the event only, with names and roles, by page', async () => {
    const { services } = createTestAccessServices();
    const event = await seedEvent();
    await seedEvent({ label: 'other' });
    await addCollaborator({
      ...event,
      userId: await createTestUser(),
      roleKey: 'reader',
      status: 'revoked',
    });
    const context = contextAs(event, 'reader');

    const first = await services.collaborators.list(context, { limit: 3 });
    const second = await services.collaborators.list(context, {
      limit: 3,
      cursor: /** @type {string} */ (first.nextCursor),
    });

    expect(first.items).toHaveLength(3);
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    const all = [...first.items, ...second.items];
    expect(all.map((item) => item.id).sort()).toEqual(
      Object.values(event.actors)
        .map((actor) => actor.collaboratorId)
        .filter(Boolean)
        .sort(),
    );
    expect(all.find((item) => item.userId === event.actors.editor.userId)).toMatchObject({
      firstName: 'Test',
      lastName: 'editor-event',
      role: { type: 'predefined', key: 'editor' },
      permissions: [...permissionsOfRole('editor')],
      invitedBy: event.actors.owner.userId,
    });
  });
});

describe('collaborator service: update', () => {
  it('replaces a role, records it in the audit log and refreshes the cached permissions', async () => {
    const { services, resolver } = createTestAccessServices();
    const event = await seedEvent();
    const { userId, collaboratorId } = event.actors.reader;
    const key = { eventId: event.eventId, userId };
    await resolver.resolve(key);

    const updated = await services.collaborators.update(
      contextAs(event, 'admin'),
      String(collaboratorId),
      {
        role: { type: 'explicit', permissions: ['guests:write', 'event:read'] },
      },
    );

    expect(updated).toMatchObject({
      role: { type: 'explicit' },
      permissions: ['event:read', 'guests:write'],
    });
    expect(await resolver.resolve(key)).toMatchObject({ role: { type: 'explicit' } });
    expect(await AuditLog.findOne({ eventId: event.eventId }).lean()).toMatchObject({
      action: 'collaborator.permissions_changed',
      actorId: new mongoose.Types.ObjectId(event.actors.admin.userId),
      before: { role: { type: 'predefined', key: 'reader' } },
      after: { role: { type: 'explicit' }, permissions: ['event:read', 'guests:write'] },
    });

    const back = await services.collaborators.update(
      contextAs(event, 'admin'),
      String(collaboratorId),
      {
        role: { type: 'predefined', key: 'checkin_agent' },
      },
    );
    expect(back.role).toEqual({ type: 'predefined', key: 'checkin_agent' });
    const stored = await Collaborator.findOne({
      _id: collaboratorId,
      eventId: event.eventId,
    }).lean();
    expect(stored?.permissions).toBeUndefined();
  });

  it('assigns a custom role of the organization, never one of another organization', async () => {
    const { services } = createTestAccessServices();
    const event = await seedEvent();
    const other = await seedEvent({ label: 'other' });
    const createRole = async (/** @type {string} */ organizationId) =>
      String(
        (
          await CustomRole.create({
            organizationId,
            name: 'Témoin',
            permissions: ['guests:read'],
            createdBy: event.actors.owner.userId,
          })
        )._id,
      );
    const own = await createRole(event.organizationId);
    const foreign = await createRole(other.organizationId);
    const target = String(event.actors.reader.collaboratorId);

    await expect(
      services.collaborators.update(contextAs(event, 'admin'), target, {
        role: { type: 'custom', customRoleId: foreign },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(
      await services.collaborators.update(contextAs(event, 'admin'), target, {
        role: { type: 'custom', customRoleId: own },
      }),
    ).toMatchObject({ role: { type: 'custom', customRoleId: own }, permissions: ['guests:read'] });
  });

  it('applies the escalation rule, and protects the owner and the actor themselves', async () => {
    const { services } = createTestAccessServices();
    const event = await seedEvent();
    const { actors } = event;
    const id = (/** @type {keyof typeof actors} */ name) => String(actors[name].collaboratorId);
    const reader = {
      type: /** @type {const} */ ('predefined'),
      key: /** @type {const} */ ('reader'),
    };

    const attempts = [
      [
        'admin grants payouts',
        'admin',
        id('reader'),
        { type: 'explicit', permissions: ['payouts:manage'] },
        'PERMISSION_ESCALATION',
      ],
      [
        'admin grants the owner role',
        'admin',
        id('reader'),
        { type: 'predefined', key: 'owner' },
        'PERMISSION_ESCALATION',
      ],
      ['admin changes the owner', 'admin', id('owner'), reader, 'FORBIDDEN'],
      ['owner changes themselves', 'owner', id('owner'), reader, 'FORBIDDEN'],
      ['admin changes themselves', 'admin', id('admin'), reader, 'FORBIDDEN'],
      ['unknown collaborator', 'admin', unknownId(), reader, 'NOT_FOUND'],
    ];
    for (const [label, actor, target, role, code] of /** @type {any[]} */ (attempts)) {
      await expect(
        services.collaborators.update(contextAs(event, actor), target, { role }),
        label,
      ).rejects.toMatchObject({ code });
    }
    expect(await AuditLog.countDocuments({ eventId: event.eventId })).toBe(0);
  });

  it('refuses a collaborator holding more than the actor, with the permissions read in the database', async () => {
    const { services } = createTestAccessServices();
    const event = await seedEvent();
    const manager = await createTestUser();
    await addCollaborator({
      ...event,
      userId: manager,
      permissions: [...permissionsOfRole('editor'), 'collaborators:manage'],
    });
    const context = { ...contextAs(event, 'editor'), userId: manager };

    await expect(
      services.collaborators.update(context, String(event.actors.admin.collaboratorId), {
        role: { type: 'predefined', key: 'reader' },
      }),
    ).rejects.toMatchObject({ code: 'PERMISSION_ESCALATION' });

    // Un contexte qui prétend des permissions d'administrateur n'y change rien : la base fait foi.
    const claimsAdmin = { ...contextAs(event, 'admin'), userId: event.actors.reader.userId };
    await expect(
      services.collaborators.update(
        claimsAdmin,
        String(event.actors.checkin_agent.collaboratorId),
        {
          role: { type: 'predefined', key: 'reader' },
        },
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_ESCALATION' });
  });

  it('never reaches a collaborator of another event', async () => {
    const { services } = createTestAccessServices();
    const a = await seedEvent({ label: 'a' });
    const b = await seedEvent({ label: 'b' });

    await expect(
      services.collaborators.update(contextAs(a, 'owner'), String(b.actors.reader.collaboratorId), {
        role: { type: 'predefined', key: 'editor' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      services.collaborators.revoke(contextAs(a, 'owner'), String(b.actors.reader.collaboratorId)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('collaborator service: revoke', () => {
  it('revokes logically, at once for the cache, and records it', async () => {
    const { services, resolver } = createTestAccessServices();
    const event = await seedEvent();
    const { userId, collaboratorId } = event.actors.editor;
    const key = { eventId: event.eventId, userId };
    await resolver.resolve(key);

    await services.collaborators.revoke(contextAs(event, 'admin'), String(collaboratorId));

    expect(await resolver.resolve(key)).toBeNull();
    expect(
      await Collaborator.findOne({ _id: collaboratorId, eventId: event.eventId }).lean(),
    ).toMatchObject({
      status: 'revoked',
      revokedBy: new mongoose.Types.ObjectId(event.actors.admin.userId),
    });
    expect(await AuditLog.findOne({ eventId: event.eventId }).lean()).toMatchObject({
      action: 'collaborator.revoked',
      after: { status: 'revoked' },
    });
    await expect(
      services.collaborators.revoke(contextAs(event, 'admin'), String(collaboratorId)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('never revokes the owner, oneself, or someone holding more', async () => {
    const { services } = createTestAccessServices();
    const event = await seedEvent();
    const { actors } = event;

    for (const [actor, target, code] of /** @type {const} */ ([
      ['admin', 'owner', 'FORBIDDEN'],
      ['admin', 'admin', 'FORBIDDEN'],
      ['owner', 'owner', 'FORBIDDEN'],
    ])) {
      await expect(
        services.collaborators.revoke(
          contextAs(event, actor),
          String(actors[target].collaboratorId),
        ),
      ).rejects.toMatchObject({ code });
    }
    expect(await Collaborator.countDocuments({ eventId: event.eventId, status: 'active' })).toBe(5);
  });
});
