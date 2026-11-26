import { BACKUP_CODE_COUNT } from '@alyora/shared';
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

describe('two-factor setup and activation', () => {
  it('prepares a secret, kept encrypted and inactive until the first code', async () => {
    const { services, context } = await signedInAccount();

    const setup = await services.twoFactor.setup(context);

    expect(setup.otpauthUri).toContain(`otpauth://totp/ALYORA:${encodeURIComponent(EMAIL)}`);
    expect(setup.otpauthUri).toContain(`secret=${setup.secret}`);
    const svg = Buffer.from(setup.qrCodeDataUrl.split(',')[1] ?? '', 'base64').toString();
    expect(svg).toContain('<svg');
    const user = await User.findOne({ email: EMAIL })
      .select('+twoFactorPendingSecret +twoFactorSecret')
      .lean();
    expect(user?.twoFactorEnabled).toBe(false);
    expect(user?.twoFactorSecret).toBeNull();
    expect(user?.twoFactorPendingSecret).toMatch(/^v1\./);
    expect(user?.twoFactorPendingSecret).not.toContain(setup.secret);
  });

  it('refuses a wrong first code, and stays inactive', async () => {
    const { services, context, clock } = await signedInAccount();
    const { secret } = await services.twoFactor.setup(context);

    await expect(
      services.twoFactor.enable(context, { otp: totpCode(secret, clock.now(), 5) }),
    ).rejects.toMatchObject({ code: 'INVALID_TWO_FACTOR_CODE' });
    expect((await User.findOne({ email: EMAIL }).lean())?.twoFactorEnabled).toBe(false);
  });

  it('turns 2FA on, returns 8 single-use backup codes stored as keyed hashes, and signs out the other devices', async () => {
    const account = await signedInAccount();
    const other = sessionTokens(
      await account.services.login.login(anonymousContext(), { email: EMAIL, password: PASSWORD }),
    );
    const { secret } = await account.services.twoFactor.setup(account.context);

    const codes = await account.services.twoFactor.enable(account.context, {
      otp: totpCode(secret, account.clock.now()),
    });

    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    }
    const user = await User.findOne({ email: EMAIL })
      .select('+twoFactorSecret +twoFactorBackupCodes +twoFactorPendingSecret')
      .lean();
    expect(user?.twoFactorEnabled).toBe(true);
    expect(user?.twoFactorPendingSecret).toBeNull();
    expect(JSON.stringify(user?.twoFactorBackupCodes)).not.toContain(
      codes[0]?.replace('-', '') ?? '',
    );
    expect(await AuthSession.countDocuments({ revokedReason: 'two_factor_enabled' })).toBe(1);
    expect((await AuthSession.findById(account.claims.sessionId).lean())?.revokedAt).toBeNull();
    await expect(
      account.services.sessions.rotate(anonymousContext(), other.refreshToken),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(account.mailer.sent.map((message) => message.subject)).toEqual([
      'Double authentification activée',
    ]);
  });

  it('refuses a second setup or activation once 2FA is on', async () => {
    const { services, context } = await accountWithTwoFactor();

    await expect(services.twoFactor.setup(context)).rejects.toMatchObject({
      code: 'TWO_FACTOR_CONFLICT',
    });
    await expect(services.twoFactor.enable(context, { otp: '000000' })).rejects.toMatchObject({
      code: 'TWO_FACTOR_CONFLICT',
    });
  });
});

describe('two-factor deactivation', () => {
  it('turns 2FA off with a valid code, erasing the secret and the backup codes', async () => {
    const account = await accountWithTwoFactor();

    await account.services.twoFactor.disable(account.context, {
      otp: totpCode(account.secret, account.clock.now()),
    });

    const user = await User.findOne({ email: EMAIL })
      .select('+twoFactorSecret +twoFactorBackupCodes')
      .lean();
    expect(user).toMatchObject({ twoFactorEnabled: false, twoFactorSecret: null });
    expect(user?.twoFactorBackupCodes).toEqual([]);
    expect(account.mailer.sent.map((message) => message.subject)).toEqual([
      'Double authentification désactivée',
    ]);
    await expect(
      account.services.login.login(anonymousContext(), { email: EMAIL, password: PASSWORD }),
    ).resolves.toHaveProperty('accessToken');
  });

  it('refuses a wrong code, and a deactivation when 2FA is off', async () => {
    const account = await accountWithTwoFactor();

    await expect(
      account.services.twoFactor.disable(account.context, { otp: '000000' }),
    ).rejects.toMatchObject({ code: 'INVALID_TWO_FACTOR_CODE' });
    await account.services.twoFactor.disable(account.context, {
      backupCode: (account.backupCodes[0] ?? '').replace('-', ''),
    });
    await expect(
      account.services.twoFactor.disable(account.context, { otp: '000000' }),
    ).rejects.toMatchObject({ code: 'TWO_FACTOR_CONFLICT' });
  });

  it('never writes the secret or a backup code in the logs', async () => {
    const account = await accountWithTwoFactor();

    for (const secret of [account.secret, ...account.backupCodes]) {
      expect(account.logs.text()).not.toContain(secret);
    }
  });
});
