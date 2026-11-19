import { describe, expect, it } from 'vitest';
import { anonymousContext, sessionTokens, useAuthDatabase } from '../../../../test/helpers/auth.js';
import {
  EMAIL,
  PASSWORD,
  accountWithTwoFactor,
  signedInAccount,
  totpCode,
} from '../../../../test/helpers/two-factor.js';
import { AuthSession } from '../models/auth-session.model.js';
import { User } from '../models/user.model.js';

useAuthDatabase();

const NEW_PASSWORD = 'Les pirogues rentrent au port';

describe('reauthentication', () => {
  it('confirms the password and returns a token with a fresh authentication time', async () => {
    const { services, context, clock, accessTokens, claims } = await signedInAccount();
    clock.advance(30 * 60 * 1000);

    const token = await services.reauthentication.reauthenticate(context, { password: PASSWORD });

    const fresh = await accessTokens.verify(token);
    expect(fresh.authTime).toBe(Math.floor(clock.now().getTime() / 1000));
    expect(fresh.authTime).toBeGreaterThan(claims.authTime);
    expect(fresh.sessionId).toBe(claims.sessionId);
  });

  it('refuses a wrong password, and counts the failure toward the lock', async () => {
    const { services, context } = await signedInAccount();

    await expect(
      services.reauthentication.reauthenticate(context, { password: 'pas le bon' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect((await User.findOne({ email: EMAIL }).lean())?.failedLoginCount).toBe(1);
  });

  it('also asks for the second factor when 2FA is on', async () => {
    const { services, context, clock, secret } = await accountWithTwoFactor();

    await expect(
      services.reauthentication.reauthenticate(context, { password: PASSWORD }),
    ).rejects.toMatchObject({ code: 'INVALID_TWO_FACTOR_CODE' });
    await expect(
      services.reauthentication.reauthenticate(context, {
        password: PASSWORD,
        otp: totpCode(secret, clock.now()),
      }),
    ).resolves.toEqual(expect.any(String));
  });

  it('refuses a revoked session', async () => {
    const { services, context, claims } = await signedInAccount();
    await services.sessions.revoke(context, claims.sessionId);

    await expect(
      services.reauthentication.reauthenticate(context, { password: PASSWORD }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

describe('password change', () => {
  it('keeps the current session, signs out the others, and warns the owner', async () => {
    const account = await signedInAccount();
    const other = sessionTokens(
      await account.services.login.login(anonymousContext(), { email: EMAIL, password: PASSWORD }),
    );

    await account.services.reauthentication.changePassword(account.context, {
      newPassword: NEW_PASSWORD,
    });

    expect((await AuthSession.findById(account.claims.sessionId).lean())?.revokedAt).toBeNull();
    await expect(
      account.services.sessions.rotate(anonymousContext(), other.refreshToken),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(
      account.services.login.login(anonymousContext(), { email: EMAIL, password: NEW_PASSWORD }),
    ).resolves.toHaveProperty('accessToken');
    expect(account.mailer.sent.map((message) => message.text)).toEqual([
      expect.stringContaining('vos autres appareils ont été déconnectés'),
    ]);
  });

  it('refuses a weak new password, on the newPassword field', async () => {
    const { services, context } = await signedInAccount();

    await expect(
      services.reauthentication.changePassword(context, { newPassword: 'motdepasse123' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { issues: [{ path: 'newPassword', code: 'password_too_common' }] },
    });
  });
});
