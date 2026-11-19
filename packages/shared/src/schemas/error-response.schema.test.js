import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../errors/index.js';
import { errorResponseSchema } from './error-response.schema.js';

describe('errorResponseSchema', () => {
  it('accepts a payload with code, message and validation issues', () => {
    const payload = {
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Invalid request body',
      details: { issues: [{ path: 'email', code: 'invalid_format', message: 'Invalid email' }] },
    };

    expect(errorResponseSchema.parse(payload)).toEqual(payload);
  });

  it('accepts empty details, for an error that has none', () => {
    const payload = { code: ERROR_CODES.NOT_FOUND, message: 'Resource not found', details: {} };

    expect(errorResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a payload without details: the three keys are always present', () => {
    const result = errorResponseSchema.safeParse({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Resource not found',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a code that is not part of ERROR_CODES', () => {
    const result = errorResponseSchema.safeParse({ code: 'TEAPOT', message: 'Nope', details: {} });

    expect(result.success).toBe(false);
  });

  it('rejects a missing code', () => {
    const result = errorResponseSchema.safeParse({ message: 'No code', details: {} });

    expect(result.success).toBe(false);
  });

  it('rejects a missing or empty message', () => {
    expect(
      errorResponseSchema.safeParse({ code: ERROR_CODES.FORBIDDEN, details: {} }).success,
    ).toBe(false);
    expect(
      errorResponseSchema.safeParse({ code: ERROR_CODES.FORBIDDEN, message: '', details: {} })
        .success,
    ).toBe(false);
  });

  it('rejects unknown keys at the root', () => {
    const result = errorResponseSchema.safeParse({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Unexpected error',
      details: {},
      stack: 'Error: leaked stack trace',
    });

    expect(result.success).toBe(false);
  });

  it('rejects unknown keys inside details, so details cannot carry internal data', () => {
    const result = errorResponseSchema.safeParse({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Unexpected error',
      details: { stack: 'Error: leaked stack trace' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects an issue that carries the received value', () => {
    const result = errorResponseSchema.safeParse({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Invalid request body',
      details: {
        issues: [{ path: 'password', code: 'too_small', message: 'Too short', received: 'abc' }],
      },
    });

    expect(result.success).toBe(false);
  });
});
