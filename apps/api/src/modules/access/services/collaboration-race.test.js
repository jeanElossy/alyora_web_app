import { describe, expect, it } from 'vitest';
import {
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

const READER = /** @type {const} */ ({ type: 'predefined', key: 'reader' });

/** @param {PromiseSettledResult<unknown>[]} outcomes */
function summarize(outcomes) {
  return {
    fulfilled: outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
    codes: outcomes
      .filter((outcome) => outcome.status === 'rejected')
      .map((outcome) => /** @type {PromiseRejectedResult} */ (outcome).reason?.code),
  };
}

describe('collaboration under concurrency (race)', () => {
  it('accepts an invitation once when it is presented five times at once', async () => {
    const { services, mailer } = createTestAccessServices();
    const event = await seedEvent();
    const inviteeId = await createTestUser('invitee');
    const invitee = /** @type {{ email: string }} */ (
      await User.findOne({ _id: inviteeId }).lean()
    );
    await services.invitations.create(contextAs(event, 'owner'), {
      email: invitee.email,
      role: READER,
    });
    const { token } = invitationLinkFrom(
      /** @type {{ text: string }} */ (mailer.to(invitee.email)[0]),
    );
    const context = createServiceContext({ userId: inviteeId, eventId: event.eventId });

    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () => services.acceptance.accept(context, { token })),
    );

    const { fulfilled, codes } = summarize(outcomes);
    expect(fulfilled).toBe(1);
    expect(
      codes.every((code) => code === 'INVALID_TOKEN' || code === 'COLLABORATOR_CONFLICT'),
    ).toBe(true);
    expect(await Collaborator.countDocuments({ eventId: event.eventId, userId: inviteeId })).toBe(
      1,
    );
    expect(
      await AuditLog.countDocuments({ eventId: event.eventId, action: 'invitation.accepted' }),
    ).toBe(1);
  });

  it('keeps a single pending invitation when the same address is invited five times at once', async () => {
    const { services, mailer } = createTestAccessServices();
    const event = await seedEvent();
    const inviters = /** @type {const} */ (['owner', 'admin', 'editor', 'owner', 'admin']);

    const outcomes = await Promise.allSettled(
      inviters.map((inviter) =>
        services.invitations.create(contextAs(event, inviter), {
          email: 'awa.kone@exemple.ci',
          role: READER,
        }),
      ),
    );

    const { fulfilled, codes } = summarize(outcomes);
    expect(fulfilled).toBe(1);
    expect(codes).toEqual([
      'COLLABORATOR_CONFLICT',
      'COLLABORATOR_CONFLICT',
      'COLLABORATOR_CONFLICT',
      'COLLABORATOR_CONFLICT',
    ]);
    expect(
      await CollaborationInvitation.countDocuments({ eventId: event.eventId, status: 'pending' }),
    ).toBe(1);
    expect(mailer.sent).toHaveLength(1);
  });

  it('leaves exactly one owner when three transfers run at once', async () => {
    const { services } = createTestAccessServices();
    const event = await seedEvent();
    const targets = /** @type {const} */ (['admin', 'editor', 'reader']);

    const outcomes = await Promise.allSettled(
      targets.map((target) =>
        services.ownership.transfer(contextAs(event, 'owner'), {
          collaboratorId: String(event.actors[target].collaboratorId),
        }),
      ),
    );

    const { fulfilled, codes } = summarize(outcomes);
    expect(fulfilled).toBe(1);
    expect(codes.every((code) => code === 'FORBIDDEN' || code === 'COLLABORATOR_CONFLICT')).toBe(
      true,
    );
    const owners = await Collaborator.find({
      eventId: event.eventId,
      status: 'active',
      roleKey: 'owner',
    }).lean();
    expect(owners).toHaveLength(1);
    expect(String(owners[0]?.userId)).not.toBe(event.actors.owner.userId);
    expect(
      await Collaborator.findOne({
        _id: event.actors.owner.collaboratorId,
        eventId: event.eventId,
      }).lean(),
    ).toMatchObject({ roleKey: 'admin' });
    expect(
      await AuditLog.countDocuments({ eventId: event.eventId, action: 'ownership.transferred' }),
    ).toBe(1);
  });

  it('keeps a consistent collaborator when a role change and a revocation run at once', async () => {
    const { services } = createTestAccessServices();
    const event = await seedEvent();
    const target = String(event.actors.reader.collaboratorId);

    const outcomes = await Promise.allSettled([
      services.collaborators.update(contextAs(event, 'admin'), target, {
        role: { type: 'predefined', key: 'editor' },
      }),
      services.collaborators.revoke(contextAs(event, 'owner'), target),
    ]);

    const stored = await Collaborator.findOne({ _id: target, eventId: event.eventId }).lean();
    expect(stored?.status).toBe('revoked');
    const audited = await AuditLog.countDocuments({ eventId: event.eventId });
    expect(audited).toBe(summarize(outcomes).fulfilled);
  });
});
