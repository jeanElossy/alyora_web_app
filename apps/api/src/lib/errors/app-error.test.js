import { ERROR_CATALOG } from '@alyora/shared';
import { describe, expect, it } from 'vitest';
import { AppError, isAppError } from './app-error.js';

describe('AppError', () => {
  it('takes its HTTP status and default message from the shared catalog', () => {
    const error = new AppError('NOT_FOUND');

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'AppError',
      code: 'NOT_FOUND',
      httpStatus: 404,
      message: ERROR_CATALOG.NOT_FOUND.message,
      details: undefined,
    });
  });

  it('accepts a message, details and a cause', () => {
    const cause = new Error('driver failure');
    const details = {
      issues: [{ path: 'email', code: 'invalid_format', message: 'Invalid email' }],
    };

    const error = new AppError('VALIDATION_ERROR', { message: 'Invalid body', details, cause });

    expect(error).toMatchObject({ httpStatus: 400, message: 'Invalid body', details, cause });
  });

  it('refuses a code that is not in the catalog', () => {
    const unknownCode = /** @type {import('@alyora/shared/errors').ErrorCode} */ ('TEAPOT');

    expect(() => new AppError(unknownCode)).toThrow('Unknown error code: TEAPOT');
  });

  it('is recognized by isAppError, unlike other errors', () => {
    expect(isAppError(new AppError('FORBIDDEN'))).toBe(true);
    expect(isAppError(new Error('FORBIDDEN'))).toBe(false);
    expect(isAppError({ code: 'FORBIDDEN', httpStatus: 403 })).toBe(false);
  });
});
