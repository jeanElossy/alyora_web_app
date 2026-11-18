import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, createTestConfig } from '../helpers/app.js';

const ALLOWED_ORIGIN = 'https://app.alyora.example';

function buildApp() {
  return buildTestApp({ config: createTestConfig({ CORS_ORIGINS: ALLOWED_ORIGIN }) });
}

describe('security headers', () => {
  it('sends the helmet headers and hides the framework', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/v1/ping');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['strict-transport-security']).toBeDefined();
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers).not.toHaveProperty('x-powered-by');
  });
});

describe('CORS whitelist', () => {
  it('allows a whitelisted origin, with credentials and the exposed headers', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/v1/ping').set('Origin', ALLOWED_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-expose-headers']).toContain('X-Request-Id');
  });

  it('gives no CORS header to another origin, so the browser blocks it (forbidden access)', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/v1/ping').set('Origin', 'https://evil.example');

    expect(response.headers).not.toHaveProperty('access-control-allow-origin');
    expect(response.headers).not.toHaveProperty('access-control-allow-credentials');
  });

  it('answers the preflight of a whitelisted origin only', async () => {
    const { app } = buildApp();

    const allowed = await request(app)
      .options('/api/v1/ping')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');
    const refused = await request(app)
      .options('/api/v1/ping')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');

    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(refused.headers).not.toHaveProperty('access-control-allow-origin');
  });
});

describe('global rate limit on /api/v1', () => {
  it('announces the policy in the standard headers', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/v1/ping');

    expect(response.headers['ratelimit-policy']).toContain('q=1000');
    expect(response.headers.ratelimit).toContain('r=999');
  });
});

describe('response compression', () => {
  it('compresses large responses for clients that accept it', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/v1/docs').set('Accept-Encoding', 'gzip');

    expect(response.headers['content-encoding']).toBe('gzip');
  });
});
