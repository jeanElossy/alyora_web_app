import { eventIdParamsSchema, permissionsOfRole } from '@alyora/shared';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { TEST_SECRETS, buildPipelineApp } from '../../../test/helpers/app.js';
import { createTestClock } from '../../../test/helpers/auth.js';
import { createServiceContext, eventIdOf } from '../context/service-context.js';
import { eventServiceContext } from '../context/event-context.js';
import { defineRoute, mountRoutes } from '../openapi/registry.js';
import { createAccessTokens } from './access-token.js';
import { createAuthGuards } from './require-auth.js';
import { createPermissionGuards, getEventAccess } from './require-permission.js';

const EVENT_ID = '6b0790c7ff6f6a3544c1b7bb';
const USER_ID = '6b0790c7ff6f6a3544c1b7bc';
const clock = createTestClock();
const accessTokens = createAccessTokens({ secret: TEST_SECRETS.ACCESS_TOKEN_SECRET, clock });

const READER_ACCESS = Object.freeze(
  /** @type {import('./require-permission.js').EventAccess} */ ({
    eventId: EVENT_ID,
    organizationId: '6b0790c7ff6f6a3544c1b7bd',
    collaboratorId: '6b0790c7ff6f6a3544c1b7be',
    role: { type: 'predefined', key: 'reader' },
    permissions: permissionsOfRole('reader'),
  }),
);

/** @param {import('./require-permission.js').EventAccess | null} access */
function buildApp(access) {
  const resolve = vi.fn(async () => access);
  const permissions = createPermissionGuards({ resolver: { resolve } });
  const auth = createAuthGuards({ accessTokens, clock });
  /** @type {import('express').RequestHandler} */
  const echo = (req, res) => {
    const context = eventServiceContext(req);
    res.json({ access: getEventAccess(req), permissions: context.permissions });
  };
  const { app } = buildPipelineApp((pipeline) => {
    const router = express.Router();
    const params = { params: eventIdParamsSchema };
    const responses = { 200: { description: 'ok' } };
    mountRoutes(router, [
      defineRoute({
        method: 'get',
        path: '/events/:eventId/any',
        summary: 'Any collaborator',
        request: params,
        after: [auth.requireAuth(), permissions.requireEventAccess()],
        responses,
        handler: echo,
      }),
      defineRoute({
        method: 'get',
        path: '/events/:eventId/guests',
        summary: 'Read guests',
        request: params,
        after: [
          auth.requireAuth(),
          permissions.requireEventAccess(),
          permissions.requirePermission('guests:read'),
        ],
        responses,
        handler: echo,
      }),
      defineRoute({
        method: 'post',
        path: '/events/:eventId/guests',
        summary: 'Write guests',
        request: params,
        after: [auth.requireAuth(), permissions.requirePermission('guests:write')],
        responses,
        handler: echo,
      }),
      defineRoute({
        method: 'get',
        path: '/no-event',
        summary: 'Misconfigured: no eventId parameter',
        after: [auth.requireAuth(), permissions.requireEventAccess()],
        responses,
        handler: echo,
      }),
    ]);
    pipeline.use(router);
  });
  return { app, resolve };
}

const bearer = async () =>
  `Bearer ${await accessTokens.sign({ userId: USER_ID, sessionId: USER_ID, emailVerified: true, authTime: 0 })}`;

describe('requireEventAccess and requirePermission', () => {
  it('lets a collaborator holding the permission through, with the access in the service context', async () => {
    const { app, resolve } = buildApp(READER_ACCESS);

    const response = await request(app)
      .get(`/events/${EVENT_ID}/guests`)
      .set('Authorization', await bearer());

    expect(response.status).toBe(200);
    expect(response.body.access).toEqual(READER_ACCESS);
    expect(response.body.permissions).toEqual(READER_ACCESS.permissions);
    // Deux gardes, une seule résolution.
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ eventId: EVENT_ID, userId: USER_ID });
  });

  it('answers 403 FORBIDDEN to a collaborator without the permission', async () => {
    const { app } = buildApp(READER_ACCESS);

    const response = await request(app)
      .post(`/events/${EVENT_ID}/guests`)
      .set('Authorization', await bearer());

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ code: 'FORBIDDEN', message: 'Access denied', details: {} });
  });

  it('answers 404 NOT_FOUND, never 403, to an account that is not a collaborator', async () => {
    const { app } = buildApp(null);
    const authorization = await bearer();

    const read = await request(app)
      .get(`/events/${EVENT_ID}/any`)
      .set('Authorization', authorization);
    const write = await request(app)
      .post(`/events/${EVENT_ID}/guests`)
      .set('Authorization', authorization);

    for (const response of [read, write]) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        code: 'NOT_FOUND',
        message: 'Resource not found',
        details: {},
      });
    }
  });

  it('checks the authentication first, and never resolves permissions without it', async () => {
    const { app, resolve } = buildApp(READER_ACCESS);

    const response = await request(app).get(`/events/${EVENT_ID}/any`);

    expect(response.status).toBe(401);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('fails as a programming error on a route without an eventId parameter', async () => {
    const { app } = buildApp(READER_ACCESS);

    const response = await request(app)
      .get('/no-event')
      .set('Authorization', await bearer());

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('INTERNAL_ERROR');
  });

  it('refuses an unknown permission when the route is defined', () => {
    const guards = createPermissionGuards({ resolver: { resolve: async () => null } });

    expect(() => guards.requirePermission(/** @type {any} */ ('guests:delete'))).toThrow(
      /unknown permission/,
    );
  });

  it('refuses to read an access that no guard resolved', () => {
    const req = /** @type {import('express').Request} */ (/** @type {unknown} */ ({}));

    expect(() => getEventAccess(req)).toThrow(/no permission guard/);
  });
});

describe('service context', () => {
  it('carries the event, the organization and frozen permissions', () => {
    const context = createServiceContext({
      eventId: EVENT_ID,
      organizationId: READER_ACCESS.organizationId,
      permissions: ['event:read'],
    });

    expect(context).toMatchObject({ eventId: EVENT_ID, session: null });
    expect(Object.isFrozen(context.permissions)).toBe(true);
    expect(eventIdOf(context)).toBe(EVENT_ID);
    expect(() => eventIdOf(createServiceContext())).toThrow(/no event/);
    expect(createServiceContext()).toMatchObject({
      eventId: null,
      organizationId: null,
      permissions: [],
    });
  });
});
