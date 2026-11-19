import { describe, expect, it } from 'vitest';
import { refreshSessionResponseSchema } from './session.schema.js';

describe('refreshSessionResponseSchema', () => {
  it('accepts an access token', () => {
    expect(refreshSessionResponseSchema.parse({ accessToken: 'eyJ.a.b' })).toEqual({
      accessToken: 'eyJ.a.b',
    });
  });

  it('rejects an empty token, and a refresh token sent in the body', () => {
    expect(refreshSessionResponseSchema.safeParse({ accessToken: '' }).success).toBe(false);
    expect(
      refreshSessionResponseSchema.safeParse({ accessToken: 'eyJ.a.b', refreshToken: 'r' }).success,
    ).toBe(false);
  });
});
