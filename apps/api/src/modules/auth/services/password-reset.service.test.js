import { describe, expect, it } from 'vitest';
import {
  anonymousContext,
  createTestAuthServices,
  registration,
  sessionTokens,
  useAuthDatabase,
  userContext,
} from '../../../../test/helpers/auth.js';
import { tokenFrom } from '../../../../test/helpers/mail.js';
import { AuthSession } from '../models/auth-session.model.js';
import { User } from '../models/user.model.js';

useAuthDatabase();

const EMAIL = 'awa.kone@exemple.ci';
const PASSWORD = 'Le soleil se lève sur la lagune';
const NEW_PASSWORD = 'Les pirogues rentrent au port';

async function withResetLink() {
  const deps = createTestAuthServices();
  await deps.services.registration.register(anonymousContext(), registration());
  const tokens = sessionTokens(
    await deps.services.login.login(anonymousContext(), { email: EMAIL, password: PASSWORD }),
  );
  deps.mailer.clear();
  await deps.services.passwordReset.requestReset(anonymousContext(), { email: EMAIL });
  const token = tokenFrom(deps.mailer.to(EMAIL).at(-1), 'resetPassword');
  deps.mailer.clear();
  return { ...deps, token, tokens };
}

describe('password reset service', () => {
  it('replaces the password, revokes every session and warns the owner', async () => {
    const { services, token, mailer } = await withResetLink();

    await services.passwordReset.reset(anonymousContext(), { token, password: NEW_PASSWORD });

    await expect(
      services.login.login(anonymousContext(), { email: EMAIL, password: PASSWORD }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(
      services.login.login(anonymousContext(), { email: EMAIL, password: NEW_PASSWORD }),
    ).resolves.toHaveProperty('accessToken');
    expect(await AuthSession.countDocuments({ revokedReason: 'password_reset' })).toBe(1);
    expect(mailer.sent.map((message) => message.subject)).toEqual([
      'Votre mot de passe a été modifié',
    ]);
  });

  it('accepts a reset token only once', async () => {
    const { services, token } = await withResetLink();

    await services.passwordReset.reset(anonymousContext(), { token, password: NEW_PASSWORD });

    await expect(
      services.passwordReset.reset(anonymousContext(), {
        token,
        password: 'Encore un autre mot de passe',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('accepts a reset token only once under simultaneous requests (race)', async () => {
    const { services, token } = await withResetLink();

    const outcomes = await Promise.allSettled(
      ['Première phrase de passe', 'Deuxième phrase de passe', 'Troisième phrase de passe'].map(
        (password) => services.passwordReset.reset(anonymousContext(), { token, password }),
      ),
    );

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
  });

  it('keeps the link usable when the new password is refused', async () => {
    const { services, token } = await withResetLink();

    await expect(
      services.passwordReset.reset(anonymousContext(), { token, password: 'xyxyxyxyxyxy' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await services.passwordReset.reset(anonymousContext(), { token, password: NEW_PASSWORD });
  });

  it('refuses an expired link (1 hour), and a link replaced by a newer one', async () => {
    const deps = await withResetLink();
    await deps.services.passwordReset.requestReset(anonymousContext(), { email: EMAIL });
    const newer = tokenFrom(deps.mailer.to(EMAIL).at(-1), 'resetPassword');

    await expect(
      deps.services.passwordReset.reset(anonymousContext(), {
        token: deps.token,
        password: NEW_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    deps.clock.advance(60 * 60 * 1000 + 1000);
    await expect(
      deps.services.passwordReset.reset(anonymousContext(), {
        token: newer,
        password: NEW_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('lifts a lock and verifies the address', async () => {
    const { services, token, clock } = await withResetLink();
    await User.updateOne(
      { email: EMAIL },
      { $set: { lockedUntil: new Date(clock.now().getTime() + 60_000), lockoutCount: 2 } },
    );

    await services.passwordReset.reset(anonymousContext(), { token, password: NEW_PASSWORD });

    expect(await User.findOne({ email: EMAIL }).lean()).toMatchObject({
      lockedUntil: null,
      lockoutCount: 0,
      emailVerifiedAt: clock.now(),
    });
  });

  it('sends nothing for an unknown address, without saying so', async () => {
    const { services, mailer } = createTestAuthServices();

    await services.passwordReset.requestReset(anonymousContext(), { email: 'personne@exemple.ci' });

    expect(mailer.sent).toHaveLength(0);
  });
});

describe('profile service', () => {
  it('shows and updates the signed-in account, never its secrets', async () => {
    const { services, tokens, accessTokens } = await withResetLink();
    const claims = await accessTokens.verify(tokens.accessToken);
    const context = userContext(claims.userId, claims.sessionId);

    const me = await services.profile.me(context);
    const updated = await services.profile.update(context, { phone: '+2250700000000' });

    expect(me).toMatchObject({ email: EMAIL, firstName: 'Awa', emailVerified: false });
    expect(JSON.stringify(me)).not.toMatch(/passwordHash|twoFactorSecret|failedLoginCount/);
    expect(updated.phone).toBe('+2250700000000');
    expect((await services.profile.update(context, { phone: null })).phone).toBeNull();
  });

  it('refuses a context without an account, or a deleted account', async () => {
    const { services, tokens, accessTokens, clock } = await withResetLink();
    const claims = await accessTokens.verify(tokens.accessToken);
    await User.updateOne({ email: EMAIL }, { $set: { deletedAt: clock.now() } });

    await expect(services.profile.me(anonymousContext())).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(
      services.profile.me(userContext(claims.userId, claims.sessionId)),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(
      services.profile.update(userContext(claims.userId, claims.sessionId), { firstName: 'X' }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
