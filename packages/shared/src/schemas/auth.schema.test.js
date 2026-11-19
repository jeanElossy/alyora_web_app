import { describe, expect, it } from 'vitest';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../constants/auth.js';
import { currentUserSchema } from './auth-response.schema.js';
import {
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  sessionIdParamsSchema,
  updateProfileRequestSchema,
  verifyEmailRequestSchema,
} from './auth.schema.js';

const validRegistration = {
  email: 'awa@exemple.ci',
  password: 'une phrase de passe',
  firstName: 'Awa',
  lastName: 'Koné',
  accountType: 'individual',
};

describe('registerRequestSchema', () => {
  it('normalizes the e-mail address and applies the default locale and time zone', () => {
    const parsed = registerRequestSchema.parse({ ...validRegistration, email: ' Awa@Exemple.CI ' });

    expect(parsed).toMatchObject({
      email: 'awa@exemple.ci',
      locale: 'fr',
      timezone: 'Africa/Abidjan',
    });
  });

  it('keeps the password exactly as typed, spaces included', () => {
    const password = '  avec des espaces  ';
    expect(registerRequestSchema.parse({ ...validRegistration, password }).password).toBe(password);
  });

  it.each([
    ['a too short password', { password: 'a'.repeat(PASSWORD_MIN_LENGTH - 1) }],
    ['a too long password', { password: 'a'.repeat(PASSWORD_MAX_LENGTH + 1) }],
    ['an invalid e-mail address', { email: 'awa@' }],
    ['a phone number not in E.164 format', { phone: '07 00 00 00 00' }],
    ['an unknown time zone', { timezone: 'Africa/Atlantis' }],
    ['an unknown account type', { accountType: 'admin' }],
    ['an unknown key', { role: 'admin' }],
  ])('refuses %s', (_case, change) => {
    expect(registerRequestSchema.safeParse({ ...validRegistration, ...change }).success).toBe(
      false,
    );
  });

  it('accepts an international phone number', () => {
    expect(
      registerRequestSchema.parse({ ...validRegistration, phone: '+2250700000000' }).phone,
    ).toBe('+2250700000000');
  });
});

describe('loginRequestSchema', () => {
  it('accepts any non-empty password, and normalizes the e-mail address', () => {
    expect(loginRequestSchema.parse({ email: 'AWA@exemple.ci', password: 'x' })).toEqual({
      email: 'awa@exemple.ci',
      password: 'x',
    });
    expect(loginRequestSchema.safeParse({ email: 'awa@exemple.ci', password: '' }).success).toBe(
      false,
    );
  });
});

describe('e-mailed tokens', () => {
  const token = 'A'.repeat(43);

  it('accept only 43 base64url characters (256 bits)', () => {
    expect(verifyEmailRequestSchema.safeParse({ token }).success).toBe(true);
    expect(verifyEmailRequestSchema.safeParse({ token: `${token}A` }).success).toBe(false);
    expect(verifyEmailRequestSchema.safeParse({ token: 'A'.repeat(42) + '/' }).success).toBe(false);
  });

  it('come with a new password on reset, checked like at registration', () => {
    expect(resetPasswordRequestSchema.safeParse({ token, password: 'court' }).success).toBe(false);
  });
});

describe('updateProfileRequestSchema', () => {
  it('needs at least one field, and accepts null to remove the phone number', () => {
    expect(updateProfileRequestSchema.safeParse({}).success).toBe(false);
    expect(updateProfileRequestSchema.parse({ phone: null })).toEqual({ phone: null });
  });
});

describe('sessionIdParamsSchema', () => {
  it('accepts a MongoDB identifier only', () => {
    expect(sessionIdParamsSchema.safeParse({ sessionId: 'a'.repeat(24) }).success).toBe(true);
    expect(sessionIdParamsSchema.safeParse({ sessionId: '{"$ne":null}' }).success).toBe(false);
  });
});

describe('currentUserSchema', () => {
  it('never carries a password hash or a 2FA secret', () => {
    const user = {
      id: 'u1',
      email: 'awa@exemple.ci',
      firstName: 'Awa',
      lastName: 'Koné',
      phone: null,
      accountType: 'individual',
      emailVerified: true,
      phoneVerified: false,
      twoFactorEnabled: false,
      avatarUrl: null,
      locale: 'fr',
      timezone: 'Africa/Abidjan',
      createdAt: '2026-11-19T10:00:00.000Z',
    };
    expect(currentUserSchema.safeParse(user).success).toBe(true);
    expect(currentUserSchema.safeParse({ ...user, passwordHash: 'x' }).success).toBe(false);
  });
});
