import { INVITATION_TTL_SECONDS, permissionsOfRole } from '@alyora/shared';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  addCollaborator,
  contextAs,
  createTestAccessServices,
  createTestUser,
  invitationLinkFrom,
  seedEvent,
  useAccessDatabase,
} from '../../../../test/helpers/access.js';
import { AuditLog } from '../../../lib/audit/audit-log.model.js';
import { createServiceContext } from '../../../lib/context/service-context.js';
import { User } from '../../auth/models/user.model.js';
import { CollaborationInvitation } from '../models/collaboration-invitation.model.js';
import { Collaborator } from '../models/collaborator.model.js';

useAccessDatabase();

/**
 * Un événement, un compte vérifié à inviter, et l'invitation envoyée par `inviter`.
 *
 * @param {import('@alyora/shared').RoleKey} [inviter]
 * @param {import('@alyora/shared').RoleAssignment} [role]
 */
async function invited(inviter = 'editor', role = { type: 'predefined', key: 'reader' }) {
  const deps = createTestAccessServices();
  const event = await seedEvent();
  const inviteeId = await createTestUser('invitee');
  const invitee = /** @type {{ email: string }} */ (await User.findOne({ _id: inviteeId }).lean());
  const invitation = await deps.services.invitations.create(contextAs(event, inviter), {
    email: invitee.email,
    role,
  });
  const { token } = invitationLinkFrom(
    /** @type {{ text: string }} */ (deps.mailer.to(invitee.email)[0]),
  );
  /** @param {string} [userId] @param {string} [eventId] */
  const as = (userId = inviteeId, eventId = event.eventId) =>
    createServiceContext({ userId, eventId, ip: '203.0.113.7', userAgent: 'Test' });
  return { ...deps, event, inviteeId, invitation, token, as };
}

describe('invitation acceptance', () => {
  it('makes the invitee a collaborator with the invited role, once, and records it', async () => {
    const { services, resolver, event, inviteeId, invitation, token, as } = await invited();

    const collaborator = await services.acceptance.accept(as(), { token });

    expect(collaborator).toMatchObject({
      userId: inviteeId,
      role: { type: 'predefined', key: 'reader' },
      permissions: [...permissionsOfRole('reader')],
      invitedBy: event.actors.editor.userId,
    });
    expect(await resolver.resolve({ eventId: event.eventId, userId: inviteeId })).toMatchObject({
      role: { type: 'predefined', key: 'reader' },
    });
    expect(
      await CollaborationInvitation.findOne({ _id: invitation.id, eventId: event.eventId }).lean(),
    ).toMatchObject({ status: 'accepted', acceptedBy: new mongoose.Types.ObjectId(inviteeId) });
    expect(
      await AuditLog.findOne({ eventId: event.eventId, action: 'invitation.accepted' }).lean(),
    ).toMatchObject({ actorId: new mongoose.Types.ObjectId(inviteeId) });
    await expect(services.acceptance.accept(as(), { token })).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });
  });

  it('keeps an explicit list of permissions', async () => {
    const { services, token, as } = await invited('owner', {
      type: 'explicit',
      permissions: ['checkin:scan', 'event:read'],
    });

    expect(await services.acceptance.accept(as(), { token })).toMatchObject({
      role: { type: 'explicit' },
      permissions: ['event:read', 'checkin:scan'],
    });
  });

  it('refuses another account than the invited address', async () => {
    const { services, token, as } = await invited();
    const someoneElse = await createTestUser('someone');

    await expect(services.acceptance.accept(as(someoneElse), { token })).rejects.toMatchObject({
      code: 'INVITATION_EMAIL_MISMATCH',
    });
  });

  it('refuses an unknown, expired or revoked invitation, or one of another event', async () => {
    const first = await invited();
    await expect(
      first.services.acceptance.accept(first.as(), { token: 'A'.repeat(22) }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    const other = await seedEvent({ label: 'other' });
    await expect(
      first.services.acceptance.accept(first.as(undefined, other.eventId), { token: first.token }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    first.clock.advance(INVITATION_TTL_SECONDS * 1000);
    await expect(
      first.services.acceptance.accept(first.as(), { token: first.token }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });

    const second = await invited();
    await second.services.invitations.revoke(
      contextAs(second.event, 'owner'),
      second.invitation.id,
    );
    await expect(
      second.services.acceptance.accept(second.as(), { token: second.token }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('lets nobody in when the inviter was revoked or demoted since (escalation rule)', async () => {
    const revoked = await invited();
    await revoked.services.collaborators.revoke(
      contextAs(revoked.event, 'owner'),
      String(revoked.event.actors.editor.collaboratorId),
    );
    await expect(
      revoked.services.acceptance.accept(revoked.as(), { token: revoked.token }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });

    const demoted = await invited('editor', { type: 'predefined', key: 'editor' });
    await demoted.services.collaborators.update(
      contextAs(demoted.event, 'owner'),
      String(demoted.event.actors.editor.collaboratorId),
      { role: { type: 'predefined', key: 'reader' } },
    );
    await expect(
      demoted.services.acceptance.accept(demoted.as(), { token: demoted.token }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    expect(
      await Collaborator.countDocuments({
        eventId: demoted.event.eventId,
        userId: demoted.inviteeId,
      }),
    ).toBe(0);
  });

  it('refuses an invitee who already has access to the event', async () => {
    const { services, event, inviteeId, token, as } = await invited();
    await addCollaborator({ ...event, userId: inviteeId, roleKey: 'checkin_agent' });

    await expect(services.acceptance.accept(as(), { token })).rejects.toMatchObject({
      code: 'COLLABORATOR_CONFLICT',
    });
  });
});
