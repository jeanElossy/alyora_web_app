import { describe, expect, it } from 'vitest';
import { createLogCapture } from '../../../test/helpers/log-capture.js';
import { runWithContext } from '../context/request-context.js';
import { createLogger } from './create-logger.js';
import { serializeError } from './serialize-error.js';

function capturedLogger(level = 'info') {
  const logs = createLogCapture();
  const logger = createLogger({
    level,
    service: 'api',
    env: 'test',
    destination: logs.destination,
  });
  return { logger, logs };
}

describe('createLogger', () => {
  it('writes structured JSON lines with level label, ISO time, service and environment', () => {
    const { logger, logs } = capturedLogger();

    logger.info({ guests: 3 }, 'Hello');

    const [entry] = logs.entries();
    expect(entry).toMatchObject({
      level: 'info',
      service: 'api',
      env: 'test',
      guests: 3,
      msg: 'Hello',
    });
    expect(new Date(entry?.time).toISOString()).toBe(entry?.time);
  });

  it('omits the environment when none is given', () => {
    const logs = createLogCapture();
    createLogger({ level: 'info', service: 'worker', destination: logs.destination }).info('x');

    expect(logs.entries()[0]).not.toHaveProperty('env');
  });

  it('drops the lines below its level', () => {
    const { logger, logs } = capturedLogger('warn');

    logger.info('ignored');
    logger.warn('kept');

    expect(logs.entries().map((entry) => entry.msg)).toEqual(['kept']);
  });

  it('adds the correlation id of the current context, and only inside a context', () => {
    const { logger, logs } = capturedLogger();

    logger.info('outside');
    runWithContext({ correlationId: 'req-12345678' }, () => logger.info('inside'));

    const [outside, inside] = logs.entries();
    expect(outside).not.toHaveProperty('correlationId');
    expect(inside).toMatchObject({ correlationId: 'req-12345678' });
  });

  it('redacts sensitive fields of log objects and of child bindings, at any depth', () => {
    const { logger, logs } = capturedLogger();

    logger.child({ user: { email: 'awa@example.ci' } }).info(
      {
        body: { credentials: { password: 'S3cret!' } },
        headers: { authorization: 'Bearer abc' },
      },
      'Sign-in attempt',
    );

    const text = logs.text();
    expect(text).not.toContain('S3cret!');
    expect(text).not.toContain('awa@example.ci');
    expect(text).not.toContain('Bearer abc');
    expect(text).toContain('[REDACTED]');
  });

  it('serializes errors without their extra properties', () => {
    const { logger, logs } = capturedLogger();
    const error = Object.assign(new SyntaxError('Unexpected token'), {
      body: '{"password":"S3cret!"',
    });

    logger.error({ err: error }, 'Parse failed');

    expect(logs.entries()[0]?.err).toMatchObject({
      type: 'SyntaxError',
      message: 'Unexpected token',
    });
    expect(logs.text()).not.toContain('S3cret!');
  });
});

describe('serializeError', () => {
  it('keeps type, message, stack, code and the cause chain', () => {
    const root = Object.assign(new Error('socket closed'), { code: 'ECONNRESET' });
    const error = new Error('query failed', { cause: root });

    expect(serializeError(error)).toMatchObject({
      type: 'Error',
      message: 'query failed',
      stack: expect.stringContaining('query failed'),
      cause: { type: 'Error', message: 'socket closed', code: 'ECONNRESET' },
    });
  });

  it('stops following causes after three levels', () => {
    let error = new Error('level 0');
    for (let level = 1; level <= 6; level += 1) {
      error = new Error(`level ${level}`, { cause: error });
    }

    expect(JSON.stringify(serializeError(error))).not.toContain('level 2"');
  });

  it('ignores a non-string, non-number code and returns non-errors as they are', () => {
    expect(
      serializeError(Object.assign(new Error('x'), { code: { nested: true } })),
    ).not.toHaveProperty('code');
    expect(serializeError('plain reason')).toBe('plain reason');
  });
});
