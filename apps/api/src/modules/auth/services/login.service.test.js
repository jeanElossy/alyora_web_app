import { describe, expect, it } from 'vitest';
import {
  anonymousContext,
  createTestAuthServices,
  registration,
  sessionTokens,
  useAuthDatabase,
} from '../../../../test/helpers/auth.js';
import { AuthSession } from '../models/auth-session.model.js';
import { User } from '../models/user.model.js';
import { LOCK_BASE_MS, LOCK_THRESHOLD } from './login.service.js';

useAuthDatabase();

const EMAIL = 'awa.kone@exemple.ci';
const PASSWORD = 'Le soleil se lève sur la lagune';

async function withAccount() {
  const deps = createTestAuthServices();
  await deps.services.registration.register(anonymousContext(), registration());
  deps.mailer.clear();
  return deps;
}

/**
 * @param {ReturnType<typeof createTestAuthServices>} deps
 * @param {string} password
 */
const attempt = (deps, password) =>
  deps.services.login.login(anonymousContext(), { email: EMAIL, password });

describe('login service', () => {
  it('opens a session and returns an access token and a refresh token', async () => {
    const deps = await withAccount();

    const tokens = sessionTokens(await attempt(deps, PASSWORD));

    expect(tokens.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const claims = await deps.accessTokens.verify(tokens.accessToken);
    expect(claims).toMatchObject({ emailVerified: false });
    const session = await AuthSession.findById(claims.sessionId).lean();
    expect(session).toMatchObject({ deviceLabel: 'Chrome · Android', revokedAt: null });
    expect(session?.ipHash).not.toContain('203.0.113.7');
  });

  it('gives the same error for an unknown address and a wrong password', async () => {
    const deps = await withAccount();

    const unknown = await deps.services.login
      .login(anonymousContext(), { email: 'personne@exemple.ci', password: PASSWORD })
      .catch((error) => error);
    const wrong = await attempt(deps, 'pas le bon mot de passe').catch((error) => error);

    expect(unknown).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    expect(wrong).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    expect(Object.keys(unknown)).toEqual(Object.keys(wrong));
  });

  it('locks the account after 10 failures, refuses even the right password, then unlocks on its own', async () => {
    const deps = await withAccount();

    for (let failure = 0; failure < LOCK_THRESHOLD; failure += 1) {
      await expect(attempt(deps, 'mauvais mot de passe')).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
    }

    const locked = await User.findOne({ email: EMAIL }).lean();
    expect(locked?.lockedUntil).toEqual(new Date(deps.clock.now().getTime() + LOCK_BASE_MS));
    await expect(attempt(deps, PASSWORD)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(deps.mailer.sent.map((message) => message.subject)).toEqual([
      'Connexion à votre compte suspendue',
    ]);

    deps.clock.advance(LOCK_BASE_MS + 1000);
    await expect(attempt(deps, PASSWORD)).resolves.toHaveProperty('accessToken');
    expect(await User.findOne({ email: EMAIL }).lean()).toMatchObject({
      failedLoginCount: 0,
      lockedUntil: null,
      lockoutCount: 0,
    });
  });

  it('doubles the lock each time, and does not count failures during a lock', async () => {
    const deps = await withAccount();
    const failTimes = async (/** @type {number} */ count) => {
      for (let index = 0; index < count; index += 1) {
        await attempt(deps, 'mauvais mot de passe').catch(() => {});
      }
    };

    await failTimes(LOCK_THRESHOLD);
    await failTimes(5);
    expect((await User.findOne({ email: EMAIL }).lean())?.failedLoginCount).toBe(0);

    deps.clock.advance(LOCK_BASE_MS + 1000);
    await failTimes(LOCK_THRESHOLD);

    const second = await User.findOne({ email: EMAIL }).lean();
    expect(second?.lockoutCount).toBe(2);
    expect(second?.lockedUntil).toEqual(new Date(deps.clock.now().getTime() + 2 * LOCK_BASE_MS));
  });

  it('locks once and warns once under simultaneous failures (race)', async () => {
    const deps = await withAccount();
    await User.updateOne({ email: EMAIL }, { $set: { failedLoginCount: LOCK_THRESHOLD - 3 } });

    await Promise.allSettled(
      Array.from({ length: 12 }, () => attempt(deps, 'mauvais mot de passe')),
    );

    const user = await User.findOne({ email: EMAIL }).lean();
    expect(user?.lockoutCount).toBe(1);
    expect(user?.lockedUntil).not.toBeNull();
    expect(deps.mailer.sent).toHaveLength(1);
  });

  it('refuses a disabled account, even with the right password', async () => {
    const deps = await withAccount();
    await User.updateOne({ email: EMAIL }, { $set: { status: 'disabled' } });

    await expect(attempt(deps, PASSWORD)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('redoes a hash made with older parameters at the next successful login', async () => {
    const deps = await withAccount();
    const legacy = await import('argon2').then(({ default: argon2 }) =>
      argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 512, timeCost: 1 }),
    );
    await User.updateOne({ email: EMAIL }, { $set: { passwordHash: legacy } });

    await attempt(deps, PASSWORD);

    const user = await User.findOne({ email: EMAIL }).select('+passwordHash').lean();
    expect(user?.passwordHash).not.toBe(legacy);
    expect(user?.passwordHash).toMatch(/m=1024,t=1,p=1/);
  });

  it('never writes the password, the address or a token in the logs', async () => {
    const deps = await withAccount();

    const tokens = sessionTokens(await attempt(deps, PASSWORD));
    await attempt(deps, 'mauvais mot de passe').catch(() => {});

    for (const secret of [PASSWORD, EMAIL, tokens.refreshToken, tokens.accessToken]) {
      expect(deps.logs.text()).not.toContain(secret);
    }
  });
});
