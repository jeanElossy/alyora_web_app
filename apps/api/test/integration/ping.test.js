import { errorResponseSchema, pingResponseSchema } from '@alyora/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../helpers/app.js';

describe('GET /api/v1/ping', () => {
  it('answers 200 with the shared ping schema', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/v1/ping');

    expect(response.status).toBe(200);
    expect(pingResponseSchema.parse(response.body)).toEqual({ status: 'ok' });
  });

  it('returns a generated correlation id in X-Request-Id', async () => {
    const { app } = buildTestApp();

    const first = await request(app).get('/api/v1/ping');
    const second = await request(app).get('/api/v1/ping');

    expect(first.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  it('reuses a safe incoming X-Request-Id and replaces an unsafe one', async () => {
    const { app } = buildTestApp();

    const safe = await request(app).get('/api/v1/ping').set('X-Request-Id', 'edge-0123456789');
    const unsafe = await request(app).get('/api/v1/ping').set('X-Request-Id', 'x" injected');

    expect(safe.headers['x-request-id']).toBe('edge-0123456789');
    expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('is the only v1 route: another method or path answers NOT_FOUND', async () => {
    const { app } = buildTestApp();

    const post = await request(app).post('/api/v1/ping');
    const unknown = await request(app).get('/api/v1/guests');

    expect(post.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(errorResponseSchema.parse(unknown.body)).toEqual({
      code: 'NOT_FOUND',
      message: 'Route not found',
      details: {},
    });
  });
});
