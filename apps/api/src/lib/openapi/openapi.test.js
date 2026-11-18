import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getValidated } from '../http/validate.js';
import { buildOpenApiDocument, toOpenApiPath } from './build-document.js';
import { defineRoute, mountRoutes } from './registry.js';

const createGuest = defineRoute({
  method: 'post',
  path: '/events/:eventId/guests',
  summary: 'Adds a guest',
  tags: ['guests'],
  request: {
    params: z.object({ eventId: z.string() }),
    query: z.object({ notify: z.enum(['yes', 'no']).optional(), source: z.string() }),
    body: z.object({ name: z.string().min(1), seats: z.number().int().default(1) }),
  },
  responses: {
    201: { description: 'Created', schema: z.object({ id: z.string() }) },
    204: { description: 'Nothing to return' },
  },
  handler: (req, res) => {
    res.status(201).json({ id: 'g1', body: getValidated(req, 'body') });
  },
});

const listGuests = defineRoute({
  method: 'get',
  path: '/events/:eventId/guests',
  summary: 'Lists guests',
  responses: { 200: { description: 'Guests' } },
  handler: (_req, res) => {
    res.json([]);
  },
});

/**
 * Middleware d'erreur minimal : ne répond que le code d'erreur.
 *
 * @param {{ httpStatus?: number, code?: string }} error
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next Indispensable : Express reconnaît un middleware
 *   d'erreur à ses quatre paramètres.
 */
function errorToCode(error, _req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(error.httpStatus ?? 500).json({ code: error.code });
}

describe('defineRoute', () => {
  it('freezes the definition', () => {
    expect(Object.isFrozen(createGuest)).toBe(true);
  });
});

describe('mountRoutes', () => {
  it('mounts each route with its validators before the controller', async () => {
    const app = express();
    app.use(express.json());
    const router = express.Router();
    mountRoutes(router, [createGuest, listGuests]);
    app.use(router);
    app.use(errorToCode);

    const created = await request(app).post('/events/e1/guests?source=web').send({ name: 'Awa' });
    const invalid = await request(app).post('/events/e1/guests').send({ name: 'Awa' });
    const listed = await request(app).get('/events/e1/guests');

    expect(created.status).toBe(201);
    expect(created.body.body).toEqual({ name: 'Awa', seats: 1 });
    expect(invalid.body).toEqual({ code: 'VALIDATION_ERROR' });
    expect(listed.body).toEqual([]);
  });
});

describe('buildOpenApiDocument', () => {
  const document = buildOpenApiDocument({
    title: 'Test API',
    version: 'v1',
    basePath: '/api/v1',
    routes: [createGuest, listGuests],
  });
  const paths = /** @type {Record<string, any>} */ (document.paths);
  const operation = paths['/api/v1/events/{eventId}/guests'].post;

  it('produces an OpenAPI 3.1 document grouping methods under the same path', () => {
    expect(document).toMatchObject({
      openapi: '3.1.0',
      info: { title: 'Test API', version: 'v1' },
    });
    expect(Object.keys(paths['/api/v1/events/{eventId}/guests']).sort()).toEqual(['get', 'post']);
  });

  it('documents path and query parameters, with their requirement', () => {
    expect(operation.parameters).toEqual([
      { name: 'eventId', in: 'path', required: true, schema: { type: 'string' } },
      {
        name: 'notify',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['yes', 'no'] },
      },
      { name: 'source', in: 'query', required: true, schema: { type: 'string' } },
    ]);
  });

  it('documents the request body as the client sends it', () => {
    const bodySchema = operation.requestBody.content['application/json'].schema;

    expect(bodySchema.properties.seats).toMatchObject({ type: 'integer', default: 1 });
    expect(bodySchema.required).toEqual(['name']);
    expect(bodySchema).not.toHaveProperty('$schema');
  });

  it('documents success responses and the shared error format for every operation', () => {
    expect(operation.responses['201'].content['application/json'].schema).toMatchObject({
      properties: { id: { type: 'string' } },
    });
    expect(operation.responses['204']).toEqual({ description: 'Nothing to return' });
    expect(operation.responses.default.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/ErrorResponse',
    });
    const components = /** @type {{ schemas: Record<string, any> }} */ (document.components);
    expect(components.schemas.ErrorResponse.properties).toHaveProperty('code');
  });

  it('omits what a route does not declare', () => {
    const get = paths['/api/v1/events/{eventId}/guests'].get;

    expect(get).not.toHaveProperty('tags');
    expect(get).not.toHaveProperty('parameters');
    expect(get).not.toHaveProperty('requestBody');
  });
});

describe('toOpenApiPath', () => {
  it('turns Express parameters into OpenAPI templates', () => {
    expect(toOpenApiPath('/events/:eventId/guests/:guest_id')).toBe(
      '/events/{eventId}/guests/{guest_id}',
    );
    expect(toOpenApiPath('/ping')).toBe('/ping');
  });
});
