import { collaboratorListResponseSchema, permissionsOfRole } from '@alyora/shared';
import { describe, expect, it } from 'vitest';
import {
  accessTokenFor,
  addCollaborator,
  apiAs,
  createTestUser,
  seedEvent,
  useAccessDatabase,
} from '../helpers/access.js';
import { buildTestApp } from '../helpers/app.js';
import { describePermissionEscalation, describeTenantResource } from '../helpers/tenancy-suites.js';

useAccessDatabase();

const { app } = buildTestApp();
/** @param {string} eventId */
const collaborators = (eventId) => `/events/${eventId}/collaborators`;
/** @param {{ eventId: string, resourceId: string }} ids */
const collaboratorPath = ({ eventId, resourceId }) => `${collaborators(eventId)}/${resourceId}`;

/** Un Reader de plus dans l'événement. */
async function createReader(/** @type {import('../helpers/access.js').SeededEvent} */ event) {
  return addCollaborator({ ...event, userId: await createTestUser('member'), roleKey: 'reader' });
}

describe('GET /api/v1/events/:eventId/collaborators', () => {
  it('lists the team to whoever reads it, by page, but not to a check-in agent or an outsider', async () => {
    const event = await seedEvent();

    const page = await apiAs(app, event.actors.reader).get(
      `${collaborators(event.eventId)}?limit=2`,
    );
    const checkin = await apiAs(app, event.actors.checkin_agent).get(collaborators(event.eventId));
    const outsider = await apiAs(app, event.actors.outsider).get(collaborators(event.eventId));
    const tooLarge = await apiAs(app, event.actors.reader).get(
      `${collaborators(event.eventId)}?limit=500`,
    );

    expect(page.status).toBe(200);
    expect(collaboratorListResponseSchema.parse(page.body).items).toHaveLength(2);
    expect(page.body.nextCursor).toEqual(expect.any(String));
    expect(JSON.stringify(page.body)).not.toContain('@');
    expect([checkin.status, checkin.body.code]).toEqual([403, 'FORBIDDEN']);
    expect([outsider.status, outsider.body.code]).toEqual([404, 'NOT_FOUND']);
    expect(tooLarge.status).toBe(400);
  });
});

describe('PATCH and DELETE /api/v1/events/:eventId/collaborators/:collaboratorId', () => {
  it('lets an admin change a role and revoke an access, effective at once', async () => {
    const event = await seedEvent();
    const id = await createReader(event);
    const admin = apiAs(app, event.actors.admin);

    const updated = await admin.send(
      'patch',
      collaboratorPath({ eventId: event.eventId, resourceId: id }),
      {
        body: { role: { type: 'predefined', key: 'editor' } },
      },
    );
    const revoked = await admin.send(
      'delete',
      collaboratorPath({ eventId: event.eventId, resourceId: id }),
    );

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ id, permissions: [...permissionsOfRole('editor')] });
    expect(revoked.status).toBe(204);
    const list = await admin.get(collaborators(event.eventId));
    expect(list.body.items.map((/** @type {{ id: string }} */ item) => item.id)).not.toContain(id);
  });

  it('closes the access of a revoked collaborator on their very next request', async () => {
    const event = await seedEvent();
    const reader = apiAs(app, event.actors.reader);
    expect((await reader.get(`/events/${event.eventId}/permissions/me`)).status).toBe(200);

    await apiAs(app, event.actors.owner).send(
      'delete',
      collaboratorPath({
        eventId: event.eventId,
        resourceId: String(event.actors.reader.collaboratorId),
      }),
    );

    expect((await reader.get(`/events/${event.eventId}/permissions/me`)).status).toBe(404);
  });

  it('protects the owner and the caller themselves', async () => {
    const event = await seedEvent();
    const admin = apiAs(app, event.actors.admin);
    const path = (/** @type {'owner' | 'admin'} */ name) =>
      collaboratorPath({
        eventId: event.eventId,
        resourceId: String(event.actors[name].collaboratorId),
      });

    const owner = await admin.send('delete', path('owner'));
    const self = await admin.send('patch', path('admin'), {
      body: { role: { type: 'predefined', key: 'reader' } },
    });

    expect([owner.status, owner.body.code]).toEqual([403, 'FORBIDDEN']);
    expect([self.status, self.body.code]).toEqual([403, 'FORBIDDEN']);
  });
});

describePermissionEscalation({
  name: 'PATCH collaborator',
  app: () => app,
  // Un Editor qui peut aussi gérer l'équipe : il ne peut toujours rien donner au-delà de lui.
  granter: async (event) => {
    const userId = await createTestUser('manager');
    await addCollaborator({
      ...event,
      userId,
      permissions: [...permissionsOfRole('editor'), 'collaborators:manage'],
    });
    return { token: await accessTokenFor(userId) };
  },
  grant: async (client, { event, role }) =>
    client.send(
      'patch',
      collaboratorPath({ eventId: event.eventId, resourceId: await createReader(event) }),
      {
        body: { role },
      },
    ),
});

describeTenantResource({
  name: 'collaborators',
  app: () => app,
  create: createReader,
  read: {
    method: 'patch',
    path: collaboratorPath,
    body: { role: { type: 'predefined', key: 'checkin_agent' } },
  },
  list: {
    route: { method: 'get', path: ({ eventId }) => collaborators(eventId) },
    ids: (body) => body.items.map((/** @type {{ id: string }} */ item) => item.id),
  },
  writes: [
    {
      method: 'patch',
      path: collaboratorPath,
      body: { role: { type: 'predefined', key: 'reader' } },
    },
    { method: 'delete', path: collaboratorPath },
  ],
});
