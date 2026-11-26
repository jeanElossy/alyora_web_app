import { randomUUID } from 'node:crypto';
import { RECENT_AUTH_MINUTES } from '@alyora/shared';
import { describe, expect, it } from 'vitest';
import { User } from '../../src/modules/auth/models/user.model.js';
import { accessTokenFor, apiAs, seedEvent, useAccessDatabase } from '../helpers/access.js';
import { buildTestApp } from '../helpers/app.js';

useAccessDatabase();

const { app } = buildTestApp();

/** @param {string} userId */
const enableTwoFactor = (userId) => User.updateOne({ _id: userId }, { twoFactorEnabled: true });

/**
 * @param {ReturnType<typeof apiAs>} client
 * @param {import('../helpers/access.js').SeededEvent} event
 * @param {string} collaboratorId
 * @param {Record<string, string>} [headers]
 */
const transfer = (client, event, collaboratorId, headers = { 'Idempotency-Key': randomUUID() }) =>
  client.send('post', `/events/${event.eventId}/ownership-transfer`, {
    body: { collaboratorId },
    headers,
  });

describe('POST /api/v1/events/:eventId/ownership-transfer', () => {
  it('transfers the ownership with 2FA and a recent authentication, and replays a retry', async () => {
    const event = await seedEvent();
    const { owner, editor } = event.actors;
    await enableTwoFactor(owner.userId);
    const headers = { 'Idempotency-Key': randomUUID() };

    const done = await transfer(apiAs(app, owner), event, String(editor.collaboratorId), headers);
    const retry = await transfer(apiAs(app, owner), event, String(editor.collaboratorId), headers);

    expect(done.status).toBe(200);
    expect(done.body).toEqual({
      ownerCollaboratorId: editor.collaboratorId,
      formerOwnerCollaboratorId: owner.collaboratorId,
    });
    expect(retry.status).toBe(200);
    expect(retry.headers['idempotency-replayed']).toBe('true');
    const newOwner = await apiAs(app, editor).get(`/events/${event.eventId}/permissions/me`);
    const formerOwner = await apiAs(app, owner).get(`/events/${event.eventId}/permissions/me`);
    expect(newOwner.body.role).toEqual({ type: 'predefined', key: 'owner' });
    expect(formerOwner.body.role).toEqual({ type: 'predefined', key: 'admin' });
  });

  it('requires the two-factor authentication to be on (forbidden access)', async () => {
    const event = await seedEvent();

    const response = await transfer(
      apiAs(app, event.actors.owner),
      event,
      String(event.actors.editor.collaboratorId),
    );

    expect([response.status, response.body.code]).toEqual([403, 'TWO_FACTOR_REQUIRED']);
  });

  it('requires a recent authentication', async () => {
    const event = await seedEvent();
    const { owner } = event.actors;
    await enableTwoFactor(owner.userId);
    const staleToken = await accessTokenFor(owner.userId, {
      authTime: Math.floor(Date.now() / 1000) - (RECENT_AUTH_MINUTES + 1) * 60,
    });

    const response = await transfer(
      apiAs(app, { token: staleToken }),
      event,
      String(event.actors.editor.collaboratorId),
    );

    expect([response.status, response.body.code]).toEqual([401, 'REAUTHENTICATION_REQUIRED']);
  });

  it('is refused to an admin (403) and hidden from an outsider (404)', async () => {
    const event = await seedEvent();
    const { admin, outsider, editor } = event.actors;
    await Promise.all([enableTwoFactor(admin.userId), enableTwoFactor(outsider.userId)]);

    const byAdmin = await transfer(apiAs(app, admin), event, String(editor.collaboratorId));
    const byOutsider = await transfer(apiAs(app, outsider), event, String(editor.collaboratorId));

    expect([byAdmin.status, byAdmin.body.code]).toEqual([403, 'FORBIDDEN']);
    expect([byOutsider.status, byOutsider.body.code]).toEqual([404, 'NOT_FOUND']);
  });

  it('requires an Idempotency-Key', async () => {
    const event = await seedEvent();
    await enableTwoFactor(event.actors.owner.userId);

    const response = await transfer(
      apiAs(app, event.actors.owner),
      event,
      String(event.actors.editor.collaboratorId),
      {},
    );

    expect(response.status).toBe(400);
  });
});
