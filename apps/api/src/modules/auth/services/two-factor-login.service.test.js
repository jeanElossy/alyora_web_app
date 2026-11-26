import {
  TWO_FACTOR_CHALLENGE_MAX_ATTEMPTS,
  TWO_FACTOR_CHALLENGE_TTL_SECONDS,
} from '@alyora/shared';
import { describe, expect, it } from 'vitest';
import { anonymousContext, useAuthDatabase } from '../../../../test/helpers/auth.js';
import {
  EMAIL,
  PASSWORD,
  accountWithTwoFactor,
  totpCode,
} from '../../../../test/helpers/two-factor.js';
import { AuthSession } from '../models/auth-session.model.js';
import { TwoFactorChallenge } from '../models/two-factor-challenge.model.js';
import { User } from '../models/user.model.js';
import { LOCK_THRESHOLD } from './account-lock.js';

useAuthDatabase();

/** @param {Awaited<ReturnType<typeof accountWithTwoFactor>>} account */
async function challengeOf(account) {
  const result = await account.services.login.login(anonymousContext(), {
    email: EMAIL,
    password: PASSWORD,
  });
  if (!('challengeToken' in result)) {
    throw new Error('A second factor was expected');
  }
  return result.challengeToken;
}

describe('login with 2FA', () => {
  it('asks for a code after the password, without opening a session', async () => {
    const account = await accountWithTwoFactor();
    const sessionsBefore = await AuthSession.countDocuments({});

    const challengeToken = await challengeOf(account);

    expect(challengeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await AuthSession.countDocuments({})).toBe(sessionsBefore);
  });

  it('opens the session with the current TOTP code, which then cannot be replayed', async () => {
    const account = await accountWithTwoFactor();
    const code = totpCode(account.secret, account.clock.now());

    const tokens = await account.services.twoFactorLogin.complete(anonymousContext(), {
      challengeToken: await challengeOf(account),
      otp: code,
    });

    expect(tokens.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(
      account.services.twoFactorLogin.complete(anonymousContext(), {
        challengeToken: await challengeOf(account),
        otp: code,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TWO_FACTOR_CODE' });
    account.clock.advance(30_000);
    await expect(
      account.services.twoFactorLogin.complete(anonymousContext(), {
        challengeToken: await challengeOf(account),
        otp: totpCode(account.secret, account.clock.now()),
      }),
    ).resolves.toHaveProperty('accessToken');
  });

  it('accepts each backup code once', async () => {
    const account = await accountWithTwoFactor();
    const [backupCode = ''] = account.backupCodes;

    await account.services.twoFactorLogin.complete(anonymousContext(), {
      challengeToken: await challengeOf(account),
      backupCode: backupCode.replace('-', ''),
    });

    await expect(
      account.services.twoFactorLogin.complete(anonymousContext(), {
        challengeToken: await challengeOf(account),
        backupCode: backupCode.replace('-', ''),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TWO_FACTOR_CODE' });
  });

  it('accepts a backup code once under simultaneous requests (race)', async () => {
    const account = await accountWithTwoFactor();
    const backupCode = (account.backupCodes[1] ?? '').replace('-', '');
    const challenges = await Promise.all(Array.from({ length: 5 }, () => challengeOf(account)));

    const outcomes = await Promise.allSettled(
      challenges.map((challengeToken) =>
        account.services.twoFactorLogin.complete(anonymousContext(), {
          challengeToken,
          backupCode,
        }),
      ),
    );

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
  });

  it('consumes a challenge only once, even with two valid codes at the same time (race)', async () => {
    const account = await accountWithTwoFactor();
    const challengeToken = await challengeOf(account);
    const [first = '', second = ''] = account.backupCodes.map((code) => code.replace('-', ''));

    const outcomes = await Promise.allSettled([
      account.services.twoFactorLogin.complete(anonymousContext(), {
        challengeToken,
        backupCode: first,
      }),
      account.services.twoFactorLogin.complete(anonymousContext(), {
        challengeToken,
        backupCode: second,
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
  });

  it('checks at most 5 codes per challenge under simultaneous attempts (race)', async () => {
    const account = await accountWithTwoFactor();
    const challengeToken = await challengeOf(account);
    const tries = TWO_FACTOR_CHALLENGE_MAX_ATTEMPTS + 7;

    const outcomes = await Promise.allSettled(
      Array.from({ length: tries }, () =>
        account.services.twoFactorLogin.complete(anonymousContext(), {
          challengeToken,
          otp: '000000',
        }),
      ),
    );

    const codes = outcomes.map((outcome) =>
      outcome.status === 'rejected' ? outcome.reason.code : 'session_opened',
    );
    expect(codes.filter((code) => code === 'INVALID_TWO_FACTOR_CODE')).toHaveLength(
      TWO_FACTOR_CHALLENGE_MAX_ATTEMPTS,
    );
    expect(codes.filter((code) => code === 'INVALID_TOKEN')).toHaveLength(
      tries - TWO_FACTOR_CHALLENGE_MAX_ATTEMPTS,
    );
  });

  it('does not count the right password as a failure while the code is awaited', async () => {
    const account = await accountWithTwoFactor();
    await User.updateOne({ email: EMAIL }, { $set: { failedLoginCount: 3 } });

    await challengeOf(account);

    expect((await User.findOne({ email: EMAIL }).lean())?.failedLoginCount).toBe(3);
  });

  it('cancels a challenge after 5 wrong codes, and after 5 minutes', async () => {
    const account = await accountWithTwoFactor();
    const challengeToken = await challengeOf(account);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await account.services.twoFactorLogin
        .complete(anonymousContext(), { challengeToken, otp: '000000' })
        .catch(() => {});
    }

    await expect(
      account.services.twoFactorLogin.complete(anonymousContext(), {
        challengeToken,
        otp: totpCode(account.secret, account.clock.now()),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });

    const fresh = await challengeOf(account);
    account.clock.advance(TWO_FACTOR_CHALLENGE_TTL_SECONDS * 1000 + 1000);
    await expect(
      account.services.twoFactorLogin.complete(anonymousContext(), {
        challengeToken: fresh,
        otp: totpCode(account.secret, account.clock.now()),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('counts wrong codes toward the account lock', async () => {
    const account = await accountWithTwoFactor();
    for (let attempt = 0; attempt < LOCK_THRESHOLD; attempt += 1) {
      await account.services.twoFactorLogin
        .complete(anonymousContext(), {
          challengeToken: await challengeOf(account),
          otp: '000000',
        })
        .catch(() => {});
    }

    expect((await User.findOne({ email: EMAIL }).lean())?.lockedUntil).not.toBeNull();
    await expect(challengeOf(account)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('stores only the hash of a challenge token', async () => {
    const account = await accountWithTwoFactor();
    const challengeToken = await challengeOf(account);

    expect(await TwoFactorChallenge.countDocuments({ tokenHash: challengeToken })).toBe(0);
    expect(await TwoFactorChallenge.countDocuments({})).toBe(1);
  });
});
