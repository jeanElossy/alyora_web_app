import { describe, expect, it } from 'vitest';
import { REDACTED, redactLine, redactRecord, redactSensitive } from './redact.js';

describe('redactSensitive', () => {
  it('redacts sensitive fields at every depth and inside arrays', () => {
    const input = {
      password: 'L0',
      body: {
        password: 'L1',
        user: { password: 'L2', profile: { password: 'L3' } },
        guests: [{ phone: '+2250700000000', name: 'Awa' }],
      },
    };

    expect(redactSensitive(input)).toEqual({
      password: REDACTED,
      body: {
        password: REDACTED,
        user: { password: REDACTED, profile: { password: REDACTED } },
        guests: [{ phone: REDACTED, name: 'Awa' }],
      },
    });
  });

  it.each([
    'authorization',
    'Authorization',
    'cookie',
    'set-cookie',
    'password',
    'newPassword',
    'passwd',
    'token',
    'accessToken',
    'refresh_token',
    'clientSecret',
    'phone',
    'phoneNumber',
    'email',
    'e-mail',
    'guestEmail',
    'cardNumber',
    'cvv',
    'iban',
  ])('treats "%s" as sensitive', (key) => {
    expect(redactSensitive({ [key]: 'value' })).toEqual({ [key]: REDACTED });
  });

  it('redacts a sensitive field whatever its value type, objects included', () => {
    expect(redactSensitive({ token: { value: 'abc', expiresAt: 1 } })).toEqual({ token: REDACTED });
  });

  it('keeps non-sensitive fields untouched', () => {
    const input = { method: 'GET', path: '/api/v1/ping', statusCode: 200, guests: 12 };

    expect(redactSensitive(input)).toEqual(input);
  });

  it('never mutates its input', () => {
    const input = { body: { password: 'S3cret' } };

    redactSensitive(input);

    expect(input.body.password).toBe('S3cret');
  });

  it('returns primitives and non-plain objects as they are', () => {
    const date = new Date('2026-11-18T00:00:00Z');
    const error = new Error('boom');

    expect(redactSensitive('text')).toBe('text');
    expect(redactSensitive(null)).toBeNull();
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive({ at: date, err: error })).toEqual({ at: date, err: error });
  });

  it('survives circular references', () => {
    /** @type {Record<string, unknown>} */
    const input = { name: 'loop', password: 'S3cret' };
    input.self = input;

    expect(redactSensitive(input)).toEqual({
      name: 'loop',
      password: REDACTED,
      self: '[Circular]',
    });
  });

  it('keeps an object shared by two branches, which is not a cycle', () => {
    const shared = { label: 'same' };

    expect(redactSensitive({ a: shared, b: shared })).toEqual({ a: shared, b: shared });
  });

  it('truncates very deep structures instead of walking them forever', () => {
    /** @type {Record<string, unknown>} */
    const root = {};
    let node = root;
    for (let depth = 0; depth < 20; depth += 1) {
      /** @type {Record<string, unknown>} */
      const child = {};
      node.child = child;
      node = child;
    }

    expect(JSON.stringify(redactSensitive(root))).toContain('[Truncated]');
  });

  it('accepts objects without prototype', () => {
    const input = Object.assign(Object.create(null), { password: 'S3cret' });

    expect(redactRecord(input)).toEqual({ password: REDACTED });
  });
});

describe('redactLine', () => {
  it('redacts a serialized log line and keeps its trailing newline', () => {
    const line = `${JSON.stringify({ msg: 'x', user: { email: 'awa@example.ci' } })}\n`;

    const output = redactLine(line);

    expect(output.endsWith('\n')).toBe(true);
    expect(JSON.parse(output)).toEqual({ msg: 'x', user: { email: REDACTED } });
  });

  it('handles a line without trailing newline', () => {
    expect(redactLine('{"token":"abc"}')).toBe(`{"token":"${REDACTED}"}`);
  });

  it('never outputs a line it cannot parse', () => {
    const output = redactLine('not json password=S3cret');

    expect(output).not.toContain('S3cret');
    expect(JSON.parse(output)).toMatchObject({ level: 'error' });
  });
});
