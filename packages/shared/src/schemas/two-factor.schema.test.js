import { describe, expect, it } from 'vitest';
import {
  backupCodeSchema,
  loginResultSchema,
  reauthenticateRequestSchema,
  twoFactorDisableRequestSchema,
  twoFactorVerifyRequestSchema,
} from './two-factor.schema.js';

const challengeToken = 'A'.repeat(43);

describe('two-factor schemas', () => {
  it('normalizes a backup code typed with a dash, in lower case', () => {
    expect(backupCodeSchema.parse(' abcde-fgh23 ')).toBe('ABCDEFGH23');
    expect(backupCodeSchema.safeParse('ABCDE-FGH21').success).toBe(false);
  });

  it('expects exactly one second factor', () => {
    expect(twoFactorVerifyRequestSchema.safeParse({ challengeToken, otp: '123456' }).success).toBe(
      true,
    );
    expect(
      twoFactorVerifyRequestSchema.safeParse({ challengeToken, backupCode: 'ABCDEFGH23' }).success,
    ).toBe(true);
    expect(twoFactorVerifyRequestSchema.safeParse({ challengeToken }).success).toBe(false);
    expect(
      twoFactorVerifyRequestSchema.safeParse({
        challengeToken,
        otp: '123456',
        backupCode: 'ABCDEFGH23',
      }).success,
    ).toBe(false);
    expect(twoFactorDisableRequestSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a reauthentication with the password alone or with one second factor', () => {
    expect(reauthenticateRequestSchema.safeParse({ password: 'x' }).success).toBe(true);
    expect(reauthenticateRequestSchema.safeParse({ password: 'x', otp: '12345' }).success).toBe(
      false,
    );
  });

  it('describes a login answer as a session or a two-factor step', () => {
    expect(loginResultSchema.safeParse({ accessToken: 'eyJ.a.b' }).success).toBe(true);
    expect(
      loginResultSchema.safeParse({ status: 'two_factor_required', challengeToken }).success,
    ).toBe(true);
    expect(loginResultSchema.safeParse({ status: 'two_factor_required' }).success).toBe(false);
  });
});
