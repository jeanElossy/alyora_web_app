import { errorResponseSchema } from '@alyora/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildPipelineApp } from '../../../test/helpers/app.js';
import { getValidated, toIssues, validate } from './validate.js';

const bodySchema = z.strictObject({
  email: z.email(),
  password: z.string().min(12),
  guests: z.array(z.strictObject({ name: z.string().min(1) })).default([]),
});
const querySchema = z.object({ limit: z.coerce.number().int().max(200).default(50) });
const paramsSchema = z.object({ eventId: z.string().regex(/^[a-f0-9]{24}$/) });

function buildApp() {
  return buildPipelineApp((app) => {
    app.post(
      '/events/:eventId/guests',
      validate(paramsSchema, 'params'),
      validate(querySchema, 'query'),
      validate(bodySchema, 'body'),
      (req, res) => {
        res.json({
          params: getValidated(req, 'params'),
          query: getValidated(req, 'query'),
          body: getValidated(req, 'body'),
        });
      },
    );
    app.get('/unvalidated', (req, res) => {
      res.json({ body: getValidated(req, 'body') });
    });
  });
}

const EVENT_ID = 'a'.repeat(24);

describe('validate', () => {
  it('passes parsed values (coerced, with defaults) to the controller', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post(`/events/${EVENT_ID}/guests?limit=20`)
      .send({ email: 'awa@example.ci', password: 'correct-horse-battery' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      params: { eventId: EVENT_ID },
      query: { limit: 20 },
      body: { email: 'awa@example.ci', password: 'correct-horse-battery', guests: [] },
    });
  });

  it('answers VALIDATION_ERROR with the invalid fields, never with the received values', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post(`/events/${EVENT_ID}/guests`)
      .send({ email: 'not-an-email', password: 'Sh0rt!', guests: [{ name: '' }], extra: true });

    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(response.body)).toBeTruthy();
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.message).toBe('Invalid request body');
    expect(
      response.body.details.issues
        .map((/** @type {{ path: string }} */ issue) => issue.path)
        .sort(),
    ).toEqual(['', 'email', 'guests.0.name', 'password'].sort());
    expect(JSON.stringify(response.body)).not.toContain('Sh0rt!');
    expect(JSON.stringify(response.body)).not.toContain('not-an-email');
  });

  it('validates params and query before the body', async () => {
    const { app } = buildApp();

    const badParams = await request(app).post('/events/not-an-id/guests').send({});
    const badQuery = await request(app).post(`/events/${EVENT_ID}/guests?limit=5000`).send({});

    expect(badParams.body.message).toBe('Invalid request params');
    expect(badQuery.body.message).toBe('Invalid request query');
  });

  it('treats a missing JSON body as invalid', async () => {
    const { app } = buildApp();

    const response = await request(app).post(`/events/${EVENT_ID}/guests`);

    expect(response.status).toBe(400);
    expect(response.body.details.issues[0]).toMatchObject({ path: '' });
  });

  it('refuses an unknown request source when the route is declared', () => {
    const source = /** @type {import('./validate.js').RequestSource} */ (
      /** @type {unknown} */ ('headers')
    );

    expect(() => validate(z.object({}), source)).toThrow('unknown request source "headers"');
  });

  it('makes getValidated fail loudly when no validator ran: a programming error', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/unvalidated');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: {},
    });
  });
});

describe('toIssues', () => {
  it('keeps path, code and message only', () => {
    const result = z.object({ a: z.object({ b: z.number() }) }).safeParse({ a: { b: 'x' } });
    if (result.success) {
      throw new Error('expected a validation failure');
    }

    expect(toIssues(result.error)).toEqual([
      { path: 'a.b', code: 'invalid_type', message: expect.any(String) },
    ]);
  });
});
