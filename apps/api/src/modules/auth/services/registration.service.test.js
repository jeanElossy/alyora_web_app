import { describe, expect, it } from 'vitest';
import {
  anonymousContext,
  createTestAuthServices,
  registration,
  useAuthDatabase,
} from '../../../../test/helpers/auth.js';
import { tokenFrom } from '../../../../test/helpers/mail.js';
import { User } from '../models/user.model.js';
import { VerificationToken } from '../models/verification-token.model.js';

useAuthDatabase();

describe('registration service', () => {
  it('creates an unverified account, with a hashed password and a verification link', async () => {
    const { services, mailer } = createTestAuthServices();

    await services.registration.register(anonymousContext(), registration());

    const user = await User.findOne({ email: 'awa.kone@exemple.ci' })
      .select('+passwordHash')
      .lean();
    expect(user).toMatchObject({ firstName: 'Awa', emailVerifiedAt: null, status: 'active' });
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user?.passwordHash).not.toContain('soleil');
    const [email] = mailer.to('awa.kone@exemple.ci');
    expect(email?.subject).toBe('Confirmez votre adresse e-mail');
    const token = tokenFrom(email, 'verifyEmail');
    expect(await VerificationToken.countDocuments({ tokenHash: token })).toBe(0);
    expect(await VerificationToken.countDocuments({ userId: user?._id, purpose: 'email' })).toBe(1);
  });

  it('changes nothing for an address that already has an account, and warns its owner', async () => {
    const { services, mailer } = createTestAuthServices();
    await services.registration.register(anonymousContext(), registration());
    mailer.clear();

    await services.registration.register(
      anonymousContext(),
      registration({ firstName: 'Intrus', password: 'un autre mot de passe' }),
    );

    expect(await User.countDocuments({ email: 'awa.kone@exemple.ci' })).toBe(1);
    expect((await User.findOne({ email: 'awa.kone@exemple.ci' }).lean())?.firstName).toBe('Awa');
    expect(mailer.sent.map((message) => message.subject)).toEqual([
      'Une inscription a été tentée avec votre adresse',
    ]);
  });

  it('creates a single account for simultaneous registrations of the same address (race)', async () => {
    const { services, mailer } = createTestAuthServices();

    const outcomes = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        services.registration.register(anonymousContext(), registration({ lastName: `N${index}` })),
      ),
    );

    expect(outcomes.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
    expect(await User.countDocuments({ email: 'awa.kone@exemple.ci' })).toBe(1);
    const subjects = mailer.sent.map((message) => message.subject);
    expect(subjects.filter((subject) => subject.startsWith('Confirmez'))).toHaveLength(1);
    expect(subjects.filter((subject) => subject.startsWith('Une inscription'))).toHaveLength(7);
  });

  it('refuses a common password, and creates nothing', async () => {
    const { services, mailer } = createTestAuthServices();

    await expect(
      services.registration.register(anonymousContext(), registration({ password: 'azertyuiop' })),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { issues: [{ path: 'password', code: 'password_too_common' }] },
    });
    expect(await User.countDocuments({})).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it('still succeeds when the e-mail cannot be queued, and logs the failure without the address', async () => {
    const { services, mailer, logs } = createTestAuthServices();
    mailer.failing = true;

    await services.registration.register(anonymousContext(), registration());

    expect(await User.countDocuments({})).toBe(1);
    expect(logs.text()).toContain('Unable to queue an email');
    expect(logs.text()).not.toContain('awa.kone@exemple.ci');
  });
});

describe('email verification service', () => {
  /** @param {ReturnType<typeof createTestAuthServices>} deps */
  async function registered({ services, mailer }) {
    await services.registration.register(anonymousContext(), registration());
    return tokenFrom(mailer.to('awa.kone@exemple.ci').at(-1), 'verifyEmail');
  }

  it('verifies the address with the token, which then no longer works', async () => {
    const deps = createTestAuthServices();
    const token = await registered(deps);

    await deps.services.emailVerification.verify(anonymousContext(), { token });

    expect((await User.findOne({}).lean())?.emailVerifiedAt).toEqual(deps.clock.now());
    await expect(
      deps.services.emailVerification.verify(anonymousContext(), { token }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('consumes a token only once under simultaneous requests (race)', async () => {
    const deps = createTestAuthServices();
    const token = await registered(deps);

    const outcomes = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        deps.services.emailVerification.verify(anonymousContext(), { token }),
      ),
    );

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    for (const outcome of outcomes.filter((item) => item.status === 'rejected')) {
      expect(outcome).toMatchObject({ reason: { code: 'INVALID_TOKEN' } });
    }
  });

  it('refuses an expired token (24 hours)', async () => {
    const deps = createTestAuthServices();
    const token = await registered(deps);

    deps.clock.advance(24 * 60 * 60 * 1000 + 1000);

    await expect(
      deps.services.emailVerification.verify(anonymousContext(), { token }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    expect((await User.findOne({}).lean())?.emailVerifiedAt).toBeNull();
  });

  it('sends a new link that replaces the previous one', async () => {
    const deps = createTestAuthServices();
    const first = await registered(deps);

    await deps.services.emailVerification.resend(anonymousContext(), {
      email: 'awa.kone@exemple.ci',
    });
    const second = tokenFrom(deps.mailer.to('awa.kone@exemple.ci').at(-1), 'verifyEmail');

    expect(second).not.toBe(first);
    await expect(
      deps.services.emailVerification.verify(anonymousContext(), { token: first }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    await deps.services.emailVerification.verify(anonymousContext(), { token: second });
  });

  it('sends nothing for an unknown or already verified address, without saying so', async () => {
    const deps = createTestAuthServices();
    const token = await registered(deps);
    await deps.services.emailVerification.verify(anonymousContext(), { token });
    deps.mailer.clear();

    await deps.services.emailVerification.resend(anonymousContext(), {
      email: 'awa.kone@exemple.ci',
    });
    await deps.services.emailVerification.resend(anonymousContext(), {
      email: 'personne@exemple.ci',
    });

    expect(deps.mailer.sent).toHaveLength(0);
  });
});
