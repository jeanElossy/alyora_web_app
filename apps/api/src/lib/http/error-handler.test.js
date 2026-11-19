import { errorResponseSchema } from '@alyora/shared';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildPipelineApp, createTestConfig } from '../../../test/helpers/app.js';
import { AppError } from '../errors/app-error.js';
import { JSON_BODY_LIMIT } from './security.js';
import { toAppError, toErrorBody } from './error-handler.js';

/** @param {{ production?: boolean }} [options] */
function buildApp({ production = false } = {}) {
  const config = production
    ? createTestConfig({
        NODE_ENV: 'production',
        PORT: '8080',
        LOG_LEVEL: 'info',
        CORS_ORIGINS: 'https://app.alyora.example',
        TRUST_PROXY: '1',
        MONGODB_MAX_POOL_SIZE: '10',
      })
    : createTestConfig();
  return buildPipelineApp(
    (app) => {
      app.post('/async-failure', async () => {
        await delay(1);
        throw new Error('Database exploded at db.js:42 with mongodb://admin:Pw@host');
      });
      app.get('/sync-failure', () => {
        throw new TypeError('Cannot read properties of undefined');
      });
      app.get('/expected', () => {
        throw new AppError('FORBIDDEN', { message: 'Not a collaborator of this event' });
      });
      app.get('/late-failure', (_req, res, next) => {
        res.status(200).write('partial');
        next(new Error('after headers'));
      });
      app.post('/echo', (req, res) => {
        res.json(req.body);
      });
    },
    { config },
  );
}

describe('errorHandler', () => {
  it('catches an error thrown by an async handler and answers a generic INTERNAL_ERROR', async () => {
    const { app, logs } = buildApp();

    const response = await request(app).post('/async-failure');

    expect(response.status).toBe(500);
    expect(errorResponseSchema.parse(response.body)).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: {},
    });
    const errorLog = logs.entries().find((entry) => entry.msg === 'Request failed');
    expect(errorLog).toMatchObject({
      level: 'error',
      code: 'INTERNAL_ERROR',
      correlationId: response.headers['x-request-id'],
      err: { type: 'Error', message: expect.stringContaining('Database exploded') },
    });
    expect(errorLog?.err.stack).toEqual(expect.any(String));
  });

  it('never puts the stack or the internal message in the response, in production either', async () => {
    for (const production of [false, true]) {
      const { app } = buildApp({ production });

      const response = await request(app).post('/async-failure');
      const sync = await request(app).get('/sync-failure');

      for (const body of [JSON.stringify(response.body), JSON.stringify(sync.body)]) {
        expect(body).not.toMatch(/stack|db\.js|exploded|mongodb:|Cannot read/);
      }
    }
  });

  it('answers an AppError with its own code, status and message, logged as a warning', async () => {
    const { app, logs } = buildApp();

    const response = await request(app).get('/expected');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'FORBIDDEN',
      message: 'Not a collaborator of this event',
      details: {},
    });
    expect(logs.entries().find((entry) => entry.code === 'FORBIDDEN')).toMatchObject({
      level: 'warn',
    });
  });

  it('answers malformed JSON with VALIDATION_ERROR, without echoing nor logging the body', async () => {
    const { app, logs } = buildApp();

    const response = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"email":"awa@example.ci","password": S3cretPass}');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Malformed JSON body',
      details: {},
    });
    expect(logs.entries().find((entry) => entry.bodyErrorType)).toMatchObject({
      bodyErrorType: 'entity.parse.failed',
    });
    expect(logs.text()).not.toContain('S3cretPass');
    expect(logs.text()).not.toContain('awa@example.ci');
  });

  it(`answers a body above ${JSON_BODY_LIMIT} with PAYLOAD_TOO_LARGE`, async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/echo')
      .send({ notes: 'x'.repeat(200 * 1024) });

    expect(response.status).toBe(413);
    expect(response.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('answers an unsupported body encoding with VALIDATION_ERROR', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'compress')
      .send('{}');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Unsupported body encoding');
  });

  it('lets Express close the connection when the headers are already sent', async () => {
    const { app } = buildApp();

    const outcome = await request(app)
      .get('/late-failure')
      .then((response) => response.status)
      .catch((/** @type {Error} */ error) => error.message);

    // Le client a reçu la ligne de statut 200, puis la connexion a été coupée.
    expect([200, 'aborted', 'socket hang up']).toContain(outcome);
  });
});

describe('toAppError', () => {
  it('keeps an AppError and wraps anything else, without exposing it', () => {
    const appError = new AppError('NOT_FOUND');
    const wrapped = toAppError('a string was thrown');

    expect(toAppError(appError)).toBe(appError);
    expect(wrapped).toMatchObject({ code: 'INTERNAL_ERROR', cause: 'a string was thrown' });
    expect(toAppError(Object.assign(new Error('x'), { type: 'some.library.type' })).code).toBe(
      'INTERNAL_ERROR',
    );
  });
});

describe('toErrorBody', () => {
  it('always includes details, empty when the error has none', () => {
    const details = {
      issues: [{ path: 'email', code: 'invalid_format', message: 'Invalid email' }],
    };

    expect(toErrorBody(new AppError('NOT_FOUND'))).toEqual({
      code: 'NOT_FOUND',
      message: 'Resource not found',
      details: {},
    });
    expect(toErrorBody(new AppError('VALIDATION_ERROR', { details }))).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details,
    });
  });
});
