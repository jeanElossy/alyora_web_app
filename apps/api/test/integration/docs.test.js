import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, createTestConfig } from '../helpers/app.js';

const PRODUCTION = {
  NODE_ENV: 'production',
  PORT: '8080',
  LOG_LEVEL: 'info',
  CORS_ORIGINS: 'https://app.alyora.example',
  TRUST_PROXY: '1',
  MONGODB_MAX_POOL_SIZE: '10',
  WEB_APP_URL: 'https://app.alyora.example',
};

describe('GET /api/v1/docs', () => {
  it('serves the OpenAPI 3.1 document generated from the route definitions', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/v1/docs');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ openapi: '3.1.0', info: { title: 'ALYORA API' } });
    expect(response.body.paths['/api/v1/ping'].get.responses['200'].content).toMatchObject({
      'application/json': { schema: { properties: { status: { const: 'ok' } } } },
    });
  });

  it('documents only the v1 routes: neither the probes nor the docs route itself', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/v1/docs');

    const paths = Object.keys(response.body.paths);
    expect(paths).toContain('/api/v1/ping');
    expect(paths).toContain('/api/v1/auth/login');
    expect(paths).toContain('/api/v1/auth/sessions/{sessionId}');
    expect(paths.every((path) => path.startsWith('/api/v1/'))).toBe(true);
    expect(paths).not.toContain('/api/v1/docs');
  });

  it('does not exist in production (forbidden access)', async () => {
    const { app } = buildTestApp({ config: createTestConfig(PRODUCTION) });

    const response = await request(app).get('/api/v1/docs');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: 'NOT_FOUND', message: 'Route not found', details: {} });
  });
});
