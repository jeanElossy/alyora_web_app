import { ERROR_CODES, errorResponseSchema } from '@alyora/shared';
import { describe, expect, it } from 'vitest';
import * as api from './index.js';

describe('@alyora/api workspace wiring', () => {
  it('resolves @alyora/shared through the workspace', () => {
    const payload = { code: ERROR_CODES.NOT_FOUND, message: 'Resource not found' };

    expect(errorResponseSchema.parse(payload)).toEqual(payload);
  });

  it('exposes a library entry point that loads without side effects', () => {
    expect(api).toBeTypeOf('object');
  });
});
