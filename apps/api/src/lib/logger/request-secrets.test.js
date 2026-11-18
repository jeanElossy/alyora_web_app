import { describe, expect, it } from 'vitest';
import { createLogCapture } from '../../../test/helpers/log-capture.js';
import { createLogger } from './create-logger.js';
import { REDACTED, redactSensitive } from './redact.js';
import {
  MIN_SECRET_LENGTH,
  collectRequestSecrets,
  getRequestSecrets,
  runWithRequestSecrets,
} from './request-secrets.js';

describe('collectRequestSecrets', () => {
  it('collects values under sensitive names in the body and the query, at any depth', () => {
    const secrets = collectRequestSecrets({
      body: {
        name: 'Awa Koné',
        password: 'correct-horse',
        contact: { email: 'awa@example.ci', phones: ['+2250700000001', 2250700000002] },
        guests: [{ name: 'Yao', tokens: { invitation: 'tok_abcdef123456' } }],
      },
      query: { token: 'query-token-123', page: '2' },
      headers: {},
    });

    expect([...secrets].sort()).toEqual(
      [
        'correct-horse',
        'awa@example.ci',
        '+2250700000001',
        '2250700000002',
        'tok_abcdef123456',
        'query-token-123',
      ].sort(),
    );
  });

  it('collects the credentials headers: the whole Authorization value, its credential and cookies', () => {
    const secrets = collectRequestSecrets({
      headers: {
        authorization: 'Bearer eyJhbGciOi.payload',
        cookie: 'refresh_token=r3fr3sh-value; theme=dark',
      },
    });

    expect(secrets).toContain('Bearer eyJhbGciOi.payload');
    expect(secrets).toContain('eyJhbGciOi.payload');
    expect(secrets).toContain('r3fr3sh-value');
  });

  it(`ignores values shorter than ${MIN_SECRET_LENGTH} characters and non-sensitive fields`, () => {
    const secrets = collectRequestSecrets({
      body: { password: 'abc', name: 'long enough but not sensitive' },
      headers: { cookie: 'flag' },
    });

    expect(secrets).toEqual([]);
  });

  it('orders the values longest first, so that a value containing another is erased whole', () => {
    const secrets = collectRequestSecrets({
      body: { password: 'secret-1', confirmPassword: 'secret-1-and-more' },
      headers: {},
    });

    expect(secrets).toEqual(['secret-1-and-more', 'secret-1']);
    expect(redactSensitive('typed secret-1-and-more', secrets)).toBe(`typed ${REDACTED}`);
  });

  it('survives a missing body and very deep structures', () => {
    /** @type {Record<string, unknown>} */
    let deep = { password: 'too-deep-to-matter' };
    for (let level = 0; level < 15; level += 1) {
      deep = { nested: deep };
    }

    expect(collectRequestSecrets({ body: undefined, query: deep, headers: {} })).toEqual([]);
  });
});

describe('request secrets in the logger', () => {
  it('erases the secrets of the current request from any text of a log line', () => {
    const logs = createLogCapture();
    const logger = createLogger({ level: 'info', service: 'api', destination: logs.destination });

    runWithRequestSecrets(['correct-horse'], () => {
      logger.error(
        { err: new Error('Cannot hash correct-horse') },
        'Sign-in of correct-horse failed',
      );
    });
    logger.info('Outside of the request, correct-horse is not known as a secret');

    const [inside, outside] = logs.entries();
    expect(JSON.stringify(inside)).not.toContain('correct-horse');
    expect(inside?.msg).toBe(`Sign-in of ${REDACTED} failed`);
    expect(outside?.msg).toContain('correct-horse');
    expect(getRequestSecrets()).toEqual([]);
  });
});
