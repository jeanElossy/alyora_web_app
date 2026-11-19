import { MAX_ACTIVE_SESSIONS, REFRESH_TOKEN_TTL_SECONDS } from '@alyora/shared';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  anonymousContext,
  createTestAuthServices,
  registration,
  sessionTokens,
  useAuthDatabase,
  userContext,
} from '../../../../test/helpers/auth.js';
import { AuthSession } from '../models/auth-session.model.js';
import { RefreshToken } from '../models/refresh-token.model.js';
import { User } from '../models/user.model.js';

useAuthDatabase();

const EMAIL = 'awa.kone@exemple.ci';
const PASSWORD = 'Le soleil se lève sur la lagune';

/** Un compte, connecté une fois. */
async function signedIn() {
  const deps = createTestAuthServices();
  await deps.services.registration.register(anonymousContext(), registration());
  const tokens = sessionTokens(
    await deps.services.login.login(anonymousContext(), { email: EMAIL, password: PASSWORD }),
  );
  const claims = await deps.accessTokens.verify(tokens.accessToken);
  deps.mailer.clear();
  return { ...deps, tokens, claims, context: userContext(claims.userId, claims.sessionId) };
}

describe('session service: refresh token rotation', () => {
  it('consumes the presented token and issues a new pair, in the same family', async () => {
    const { services, tokens, claims } = await signedIn();

    const renewed = await services.sessions.rotate(anonymousContext(), tokens.refreshToken);

    expect(renewed.refreshToken).not.toBe(tokens.refreshToken);
    const family = await RefreshToken.find({ familyId: claims.sessionId }).lean();
    expect(family).toHaveLength(2);
    const consumed = family.find((token) => token.usedAt !== null);
    const successor = family.find((token) => token.usedAt === null);
    expect(consumed?.replacedBy?.toString()).toBe(successor?._id.toString());
  });

  it('revokes the whole family when an already used token comes back (presumed theft)', async () => {
    const { services, tokens, claims, mailer, logs } = await signedIn();
    const renewed = await services.sessions.rotate(anonymousContext(), tokens.refreshToken);

    await expect(
      services.sessions.rotate(anonymousContext(), tokens.refreshToken),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    // Le jeton légitime le plus récent ne sert plus non plus : il faut se reconnecter.
    await expect(
      services.sessions.rotate(anonymousContext(), renewed.refreshToken),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(await RefreshToken.countDocuments({ familyId: claims.sessionId, revokedAt: null })).toBe(
      0,
    );
    expect(await AuthSession.findById(claims.sessionId).lean()).toMatchObject({
      revokedReason: 'refresh_reuse',
    });
    expect(mailer.sent.map((message) => message.subject)).toEqual([
      'Activité inhabituelle sur votre compte',
    ]);
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({ event: 'auth.refresh_token_reuse', familyId: claims.sessionId }),
    );
    expect(logs.text()).not.toContain(tokens.refreshToken);
  });

  it('lets only one of two simultaneous refreshes with the same token win, then revokes the family (race)', async () => {
    const { services, tokens, claims } = await signedIn();

    const outcomes = await Promise.allSettled([
      services.sessions.rotate(anonymousContext(), tokens.refreshToken),
      services.sessions.rotate(anonymousContext(), tokens.refreshToken),
    ]);

    // Rotation stricte : un second usage du même jeton est traité comme un vol.
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(await RefreshToken.countDocuments({ familyId: claims.sessionId, revokedAt: null })).toBe(
      0,
    );
  });

  it('refuses a token of a revoked session (rule: revocation stops refresh at once)', async () => {
    const { services, tokens, claims, context } = await signedIn();

    await services.sessions.revoke(context, claims.sessionId);

    await expect(
      services.sessions.rotate(anonymousContext(), tokens.refreshToken),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('refuses an expired, unknown or deleted-account token', async () => {
    const first = await signedIn();
    first.clock.advance(REFRESH_TOKEN_TTL_SECONDS * 1000 + 1000);
    await expect(
      first.services.sessions.rotate(anonymousContext(), first.tokens.refreshToken),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    await expect(
      first.services.sessions.rotate(anonymousContext(), 'A'.repeat(43)),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('refuses the token of an account deleted since', async () => {
    const { services, tokens, clock } = await signedIn();
    await User.updateOne({ email: EMAIL }, { $set: { deletedAt: clock.now() } });

    await expect(
      services.sessions.rotate(anonymousContext(), tokens.refreshToken),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

describe('session service: listing and revocation', () => {
  it('lists the active sessions, the current one flagged, without internal fields', async () => {
    const { services, context, claims } = await signedIn();
    await services.login.login(anonymousContext('Mozilla/5.0 (iPhone) Version/18.1 Safari/604.1'), {
      email: EMAIL,
      password: PASSWORD,
    });

    const sessions = await services.sessions.list(context);

    expect(sessions).toHaveLength(2);
    expect(sessions.find((session) => session.current)?.id).toBe(claims.sessionId);
    expect(Object.keys(sessions[0] ?? {}).sort()).toEqual(
      ['createdAt', 'current', 'deviceLabel', 'id', 'lastSeenAt'].sort(),
    );
  });

  it("answers NOT_FOUND for another account's session, exactly like an unknown one (forbidden access)", async () => {
    const owner = await signedIn();
    const intruder = createTestAuthServices();
    await intruder.services.registration.register(
      anonymousContext(),
      registration({ email: 'intrus@exemple.ci' }),
    );
    const intruderTokens = sessionTokens(
      await intruder.services.login.login(anonymousContext(), {
        email: 'intrus@exemple.ci',
        password: PASSWORD,
      }),
    );
    const intruderClaims = await intruder.accessTokens.verify(intruderTokens.accessToken);
    const intruderContext = userContext(intruderClaims.userId, intruderClaims.sessionId);

    await expect(
      intruder.services.sessions.revoke(intruderContext, owner.claims.sessionId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      intruder.services.sessions.revoke(intruderContext, new mongoose.Types.ObjectId().toString()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await AuthSession.findById(owner.claims.sessionId).lean()).toMatchObject({
      revokedAt: null,
    });
  });

  it('signs out the current device, or every device', async () => {
    const { services, context, claims } = await signedIn();
    await services.login.login(anonymousContext(), { email: EMAIL, password: PASSWORD });

    await services.sessions.logout(context);
    expect(await AuthSession.findById(claims.sessionId).lean()).toMatchObject({
      revokedReason: 'logout',
    });
    expect(await services.sessions.list(context)).toHaveLength(1);

    await services.sessions.revokeAll(context);
    expect(await services.sessions.list(context)).toHaveLength(0);
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
  });

  it(`keeps at most ${MAX_ACTIVE_SESSIONS} active sessions, revoking the least recently used`, async () => {
    const { services, context, clock } = await signedIn();
    for (let index = 0; index < MAX_ACTIVE_SESSIONS + 2; index += 1) {
      clock.advance(1000);
      await services.login.login(anonymousContext(), { email: EMAIL, password: PASSWORD });
    }

    expect(await services.sessions.list(context)).toHaveLength(MAX_ACTIVE_SESSIONS);
    expect(await AuthSession.countDocuments({ revokedReason: 'session_limit' })).toBe(3);
  });

  it('refuses a context without an account', async () => {
    const { services } = await signedIn();

    await expect(services.sessions.list(anonymousContext())).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});
