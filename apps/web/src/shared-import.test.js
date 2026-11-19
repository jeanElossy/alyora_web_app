import { ERROR_CODES, errorResponseSchema } from '@alyora/shared';
import { describe, expect, it } from 'vitest';

describe('@alyora/web workspace wiring', () => {
  it('resolves @alyora/shared through the Vite resolver', () => {
    const payload = { code: ERROR_CODES.FORBIDDEN, message: 'Access denied', details: {} };

    expect(errorResponseSchema.parse(payload)).toEqual(payload);
  });
});
