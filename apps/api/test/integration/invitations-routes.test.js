import { randomUUID } from 'node:crypto';
import { invitationSchema } from '@alyora/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { generateToken, hashToken } from '../../src/lib/crypto/random-token.js';
import { CollaborationInvitation } from '../../src/modules/access/models/collaboration-invitation.model.js';
import { User } from '../../src/modules/auth/models/user.model.js';
import {
  accessTokenFor,
  apiAs,
  createTestUser,
  invitationLinkFrom,
  seedEvent,
  useAccessDatabase,
} from '../helpers/access.js';
import { buildTestApp } from '../helpers/app.js';
import { describePermissionEscalation, describeTenantResource } from '../helpers/tenancy-suites.js';

useAccessDatabase();

const { app, mailer } = buildTestApp();
const idempotencyKey = () => ({ 'Idempotency-Key': randomUUID() });
const READER = { type: 'predefined', key: 'reader' };
/** @param {string} eventId */
const invitations = (eventId) => `/events/${eventId}/invitations`;

/** Une invitation en attente, créée directement en base. */
async function createInvitation(/** @type {import('../helpers/access.js').SeededEvent} */ event) {
  const record = await CollaborationInvitation.create({
    eventId: event.eventId,
    organizationId: event.organizationId,
    email: `${randomUUID().slice(0, 8)}@exemple.ci`,
    roleKey: 'reader',
    invitedBy: event.actors.owner.userId,
    tokenHash: hashToken(generateToken(16)),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return String(record._id);
}

describe('POST /api/v1/events/:eventId/invitations', () => {
  it('invites an address (201) and requires an Idempotency-Key', async () => {
    const event = await seedEvent();
    const editor = apiAs(app, event.actors.editor);
    const body = { email: 'awa.kone@exemple.ci', role: READER };

    const missingKey = await editor.send('post', invitations(event.eventId), { body });
    const created = await editor.send('post', invitations(event.eventId), {
      body,
      headers: idempotencyKey(),
    });

    expect(missingKey.status).toBe(400);
    expect(created.status).toBe(201);
    expect(invitationSchema.parse(created.body)).toMatchObject({ email: body.email, role: READER });
    expect(created.headers['cache-control']).toBe('no-store, no-transform');
    expect(mailer.to(body.email)).toHaveLength(1);
  });

  it('replays the response for the same key, and refuses the same key from another account', async () => {
    const event = await seedEvent();
    const headers = idempotencyKey();
    const body = { email: 'replay@exemple.ci', role: READER };
    const path = invitations(event.eventId);

    const first = await apiAs(app, event.actors.owner).send('post', path, { body, headers });
    const replay = await apiAs(app, event.actors.owner).send('post', path, { body, headers });
    const stolen = await apiAs(app, event.actors.admin).send('post', path, { body, headers });

    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(stolen.status).toBe(409);
    expect(await CollaborationInvitation.countDocuments({ eventId: event.eventId })).toBe(1);
  });

  it('refuses a reader (403), an outsider (404) and a request without CSRF token (forbidden access)', async () => {
    const event = await seedEvent();
    const body = { email: 'nope@exemple.ci', role: READER };
    const path = invitations(event.eventId);

    const reader = await apiAs(app, event.actors.reader).send('post', path, {
      body,
      headers: idempotencyKey(),
    });
    const outsider = await apiAs(app, event.actors.outsider).send('post', path, {
      body,
      headers: idempotencyKey(),
    });
    const noCsrf = await request(app)
      .post(`/api/v1${path}`)
      .set('Authorization', `Bearer ${event.actors.owner.token}`)
      .set(idempotencyKey())
      .send(body);

    expect([reader.status, reader.body.code]).toEqual([403, 'FORBIDDEN']);
    expect([outsider.status, outsider.body.code]).toEqual([404, 'NOT_FOUND']);
    expect([noCsrf.status, noCsrf.body.code]).toEqual([403, 'CSRF_INVALID']);
    expect(await CollaborationInvitation.countDocuments({ eventId: event.eventId })).toBe(0);
  });
});

describePermissionEscalation({
  name: 'POST invitations',
  app: () => app,
  grant: (client, { event, role }) =>
    client.send('post', invitations(event.eventId), {
      body: { email: `${randomUUID().slice(0, 8)}@exemple.ci`, role },
      headers: idempotencyKey(),
    }),
});

describeTenantResource({
  name: 'invitations',
  app: () => app,
  create: createInvitation,
  // Opération sur une seule invitation : sa révocation.
  read: {
    method: 'delete',
    path: ({ eventId, resourceId }) => `${invitations(eventId)}/${resourceId}`,
  },
  list: {
    route: { method: 'get', path: ({ eventId }) => invitations(eventId) },
    ids: (body) => body.items.map((/** @type {{ id: string }} */ item) => item.id),
  },
  writes: [
    {
      method: 'post',
      path: ({ eventId }) => invitations(eventId),
      body: { email: 'writer@exemple.ci', role: READER },
      headers: idempotencyKey,
    },
    {
      method: 'delete',
      path: ({ eventId, resourceId }) => `${invitations(eventId)}/${resourceId}`,
    },
  ],
});

describe('GET /api/v1/events/:eventId/invitations', () => {
  it('lists the pending invitations to whoever reads the team, not to a check-in agent', async () => {
    const event = await seedEvent();
    const id = await createInvitation(event);

    const reader = await apiAs(app, event.actors.reader).get(invitations(event.eventId));
    const checkin = await apiAs(app, event.actors.checkin_agent).get(invitations(event.eventId));

    expect(reader.status).toBe(200);
    expect(reader.body.items.map((/** @type {{ id: string }} */ item) => item.id)).toEqual([id]);
    expect(JSON.stringify(reader.body)).not.toMatch(/token/i);
    expect([checkin.status, checkin.body.code]).toEqual([403, 'FORBIDDEN']);
  });
});

describe('POST /api/v1/events/:eventId/invitations/accept', () => {
  it('turns the invited account into a collaborator, from the e-mailed link', async () => {
    const event = await seedEvent();
    const inviteeId = await createTestUser('invitee');
    const invitee = { userId: inviteeId, token: await accessTokenFor(inviteeId) };
    const { email } = /** @type {{ email: string }} */ (
      await User.findOne({ _id: inviteeId }).lean()
    );
    await apiAs(app, event.actors.owner).send('post', invitations(event.eventId), {
      body: { email, role: { type: 'predefined', key: 'editor' } },
      headers: idempotencyKey(),
    });
    const link = invitationLinkFrom(/** @type {{ text: string }} */ (mailer.to(email).at(-1)));
    const accept = (/** @type {{ token: string }} */ actor, /** @type {string} */ token) =>
      apiAs(app, actor).send('post', `${invitations(link.eventId)}/accept`, {
        body: { token },
        headers: idempotencyKey(),
      });

    const anonymous = await request(app)
      .post(`/api/v1${invitations(link.eventId)}/accept`)
      .send({ token: link.token });
    const wrongAccount = await accept(event.actors.outsider, link.token);
    const wrongToken = await accept(invitee, 'B'.repeat(22));
    const accepted = await accept(invitee, link.token);
    const permissions = await apiAs(app, invitee).get(`/events/${event.eventId}/permissions/me`);

    expect(anonymous.status).toBe(403);
    expect([wrongAccount.status, wrongAccount.body.code]).toEqual([
      403,
      'INVITATION_EMAIL_MISMATCH',
    ]);
    expect([wrongToken.status, wrongToken.body.code]).toEqual([400, 'INVALID_TOKEN']);
    expect(accepted.status).toBe(201);
    expect(accepted.body).toMatchObject({ userId: inviteeId, role: { key: 'editor' } });
    expect(permissions.body.role).toEqual({ type: 'predefined', key: 'editor' });
  });

  it('documents the collaboration routes', async () => {
    const docs = await request(app).get('/api/v1/docs');

    expect(Object.keys(docs.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/events/{eventId}/invitations',
        '/api/v1/events/{eventId}/invitations/{invitationId}',
        '/api/v1/events/{eventId}/invitations/accept',
        '/api/v1/events/{eventId}/collaborators',
        '/api/v1/events/{eventId}/collaborators/{collaboratorId}',
        '/api/v1/events/{eventId}/ownership-transfer',
      ]),
    );
  });
});
