import { INVITATION_TTL_SECONDS, permissionsOfRole } from '@alyora/shared';
import { describe, expect, it } from 'vitest';
import {
  contextAs,
  createTestAccessServices,
  createTestUser,
  invitationLinkFrom,
  seedEvent,
  unknownId,
  useAccessDatabase,
} from '../../../../test/helpers/access.js';
import { AuditLog } from '../../../lib/audit/audit-log.model.js';
import { hashToken } from '../../../lib/crypto/random-token.js';
import { User } from '../../auth/models/user.model.js';
import { CollaborationInvitation } from '../models/collaboration-invitation.model.js';

useAccessDatabase();

const EMAIL = 'kouassi.yao@exemple.ci';
const READER = /** @type {const} */ ({ type: 'predefined', key: 'reader' });

describe('invitation service: create', () => {
  it('stores only the token fingerprint, e-mails the link and records the invitation', async () => {
    const { services, mailer, clock } = createTestAccessServices();
    const event = await seedEvent();

    const invitation = await services.invitations.create(contextAs(event, 'editor'), {
      email: EMAIL,
      role: READER,
    });

    expect(invitation).toMatchObject({
      email: EMAIL,
      role: READER,
      permissions: [...permissionsOfRole('reader')],
      invitedBy: event.actors.editor.userId,
      status: 'pending',
      expiresAt: new Date(clock.now().getTime() + INVITATION_TTL_SECONDS * 1000).toISOString(),
    });
    expect(JSON.stringify(invitation)).not.toMatch(/token/i);
    const [message] = mailer.to(EMAIL);
    const link = invitationLinkFrom(/** @type {{ text: string }} */ (message));
    expect(link.eventId).toBe(event.eventId);
    expect(message?.text).toContain('http://localhost:5173/invitation#evenement=');
    expect(message?.text).toContain('Test editor-event vous invite');
    expect(message?.text.startsWith('Bonjour,')).toBe(true);
    const stored = await CollaborationInvitation.findOne({ eventId: event.eventId })
      .select('+tokenHash')
      .lean();
    expect(stored?.tokenHash).toBe(hashToken(link.token));
    const audit = await AuditLog.findOne({ eventId: event.eventId }).lean();
    expect(audit).toMatchObject({ action: 'invitation.created', after: { role: READER } });
    expect(JSON.stringify(audit)).not.toContain(EMAIL);
  });

  it('greets an invitee who already has an account by their first name', async () => {
    const { services, mailer } = createTestAccessServices();
    const event = await seedEvent();
    const userId = await createTestUser('invitee');
    const user = await User.findOne({ _id: userId }).lean();

    await services.invitations.create(contextAs(event, 'owner'), {
      email: /** @type {string} */ (user?.email),
      role: READER,
    });

    expect(
      mailer.to(/** @type {string} */ (user?.email))[0]?.text.startsWith('Bonjour Test,'),
    ).toBe(true);
  });

  it('applies the escalation rule: an editor grants nothing beyond their own permissions', async () => {
    const { services, mailer } = createTestAccessServices();
    const event = await seedEvent();
    const editor = contextAs(event, 'editor');

    for (const role of /** @type {import('@alyora/shared').RoleAssignment[]} */ ([
      { type: 'predefined', key: 'admin' },
      { type: 'predefined', key: 'owner' },
      { type: 'explicit', permissions: ['guests:read', 'contributions:read'] },
    ])) {
      await expect(
        services.invitations.create(editor, { email: EMAIL, role }),
        JSON.stringify(role),
      ).rejects.toMatchObject({ code: 'PERMISSION_ESCALATION' });
    }
    expect(await CollaborationInvitation.countDocuments({ eventId: event.eventId })).toBe(0);
    expect(mailer.sent).toEqual([]);
  });

  it('refuses an address that already has access, or a pending invitation', async () => {
    const { services } = createTestAccessServices();
    const event = await seedEvent();
    const reader = await User.findOne({ _id: event.actors.reader.userId }).lean();
    const owner = contextAs(event, 'owner');

    await expect(
      services.invitations.create(owner, {
        email: /** @type {string} */ (reader?.email),
        role: READER,
      }),
    ).rejects.toMatchObject({ code: 'COLLABORATOR_CONFLICT' });
    await services.invitations.create(owner, { email: EMAIL, role: READER });
    await expect(
      services.invitations.create(owner, { email: EMAIL, role: READER }),
    ).rejects.toMatchObject({ code: 'COLLABORATOR_CONFLICT' });
  });

  it('lets a new invitation replace an expired one', async () => {
    const { services, clock } = createTestAccessServices();
    const event = await seedEvent();
    const owner = contextAs(event, 'owner');
    await services.invitations.create(owner, { email: EMAIL, role: READER });

    clock.advance(INVITATION_TTL_SECONDS * 1000 + 1);
    await services.invitations.create(owner, { email: EMAIL, role: READER });

    const statuses = await CollaborationInvitation.find({ eventId: event.eventId }).distinct(
      'status',
    );
    expect(statuses.sort()).toEqual(['expired', 'pending']);
  });

  it('keeps the invitation when the e-mail cannot be queued, and logs it', async () => {
    const { services, mailer, logs } = createTestAccessServices();
    mailer.failing = true;
    const event = await seedEvent();

    await services.invitations.create(contextAs(event, 'owner'), { email: EMAIL, role: READER });

    expect(
      await CollaborationInvitation.countDocuments({ eventId: event.eventId, status: 'pending' }),
    ).toBe(1);
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({ event: 'collaboration_invitation', level: 'error' }),
    );
    expect(logs.text()).not.toContain(EMAIL);
  });
});

describe('invitation service: list and revoke', () => {
  it('lists the pending invitations of the event, flags the expired ones, by page', async () => {
    const { services, clock } = createTestAccessServices();
    const event = await seedEvent();
    const other = await seedEvent({ label: 'other' });
    const owner = contextAs(event, 'owner');
    for (const index of [1, 2, 3]) {
      await services.invitations.create(owner, {
        email: `invite${index}@exemple.ci`,
        role: READER,
      });
    }
    await services.invitations.create(contextAs(other, 'owner'), { email: EMAIL, role: READER });

    clock.advance(INVITATION_TTL_SECONDS * 1000 + 1);
    const first = await services.invitations.list(owner, { limit: 2 });
    const second = await services.invitations.list(owner, {
      limit: 2,
      cursor: /** @type {string} */ (first.nextCursor),
    });

    expect([...first.items, ...second.items].map((item) => item.email)).toEqual([
      'invite1@exemple.ci',
      'invite2@exemple.ci',
      'invite3@exemple.ci',
    ]);
    expect(second.nextCursor).toBeNull();
    expect(first.items.every((item) => item.status === 'expired')).toBe(true);
  });

  it('revokes a pending invitation within the escalation rule, and records it', async () => {
    const { services } = createTestAccessServices();
    const event = await seedEvent();
    const byOwner = await services.invitations.create(contextAs(event, 'owner'), {
      email: 'admin@exemple.ci',
      role: { type: 'predefined', key: 'admin' },
    });
    const byEditor = await services.invitations.create(contextAs(event, 'editor'), {
      email: EMAIL,
      role: READER,
    });

    await expect(
      services.invitations.revoke(contextAs(event, 'editor'), byOwner.id),
    ).rejects.toMatchObject({ code: 'PERMISSION_ESCALATION' });
    await services.invitations.revoke(contextAs(event, 'editor'), byEditor.id);

    expect(
      await CollaborationInvitation.findOne({ _id: byEditor.id, eventId: event.eventId }).lean(),
    ).toMatchObject({ status: 'revoked' });
    expect(
      await AuditLog.countDocuments({ eventId: event.eventId, action: 'invitation.revoked' }),
    ).toBe(1);
    await expect(
      services.invitations.revoke(contextAs(event, 'editor'), byEditor.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      services.invitations.revoke(contextAs(event, 'owner'), unknownId()),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
