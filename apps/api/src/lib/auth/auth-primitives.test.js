import { randomBytes } from 'node:crypto';
import { ACCESS_TOKEN_TTL_SECONDS } from '@alyora/shared';
import { SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { FAST_ARGON2, createTestClock } from '../../../test/helpers/auth.js';
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  InvalidAccessTokenError,
  createAccessTokens,
} from './access-token.js';
import { ARGON2_PARAMETERS, createPasswordHasher } from './password-hasher.js';

describe('password hasher (argon2id)', () => {
  it('hashes with the production parameters, salted, and verifies only the right password', async () => {
    const hasher = createPasswordHasher();

    const first = await hasher.hash('une phrase de passe');
    const second = await hasher.hash('une phrase de passe');

    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(first).not.toBe(second);
    expect(await hasher.verify(first, 'une phrase de passe')).toBe(true);
    expect(await hasher.verify(first, 'une phrase de passE')).toBe(false);
    expect(ARGON2_PARAMETERS).toMatchObject({ memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  });

  it('answers false for an unreadable hash instead of throwing', async () => {
    const hasher = createPasswordHasher({ parameters: FAST_ARGON2 });

    expect(await hasher.verify('$bcrypt$not-argon2', 'x')).toBe(false);
  });

  it('flags a hash made with weaker parameters, to redo it at the next login', async () => {
    const weak = await createPasswordHasher({ parameters: FAST_ARGON2 }).hash('x'.repeat(12));

    expect(createPasswordHasher().needsRehash(weak)).toBe(true);
    expect(createPasswordHasher({ parameters: FAST_ARGON2 }).needsRehash(weak)).toBe(false);
    expect(createPasswordHasher().needsRehash('not a hash')).toBe(true);
  });

  it('verifies against a dummy hash, which always fails', async () => {
    const hasher = createPasswordHasher({ parameters: FAST_ARGON2 });

    await expect(hasher.verifyDummy('any password')).resolves.toBe(false);
    await expect(hasher.verifyDummy('any password')).resolves.toBe(false);
  });
});

describe('access tokens (JWT HS256)', () => {
  const secret = randomBytes(32).toString('base64');
  const claims = {
    userId: '65f000000000000000000001',
    sessionId: '65f000000000000000000002',
    emailVerified: true,
    authTime: 1_790_000_000,
  };

  it('carry the account, the session, the verification state and the authentication time', async () => {
    const tokens = createAccessTokens({ secret, clock: createTestClock() });

    const token = await tokens.sign(claims);

    await expect(tokens.verify(token)).resolves.toEqual(claims);
    const [, payload = ''] = token.split('.');
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toMatchObject({
      sub: claims.userId,
      sid: claims.sessionId,
      iss: ACCESS_TOKEN_ISSUER,
      aud: ACCESS_TOKEN_AUDIENCE,
    });
  });

  it('expire after 15 minutes', async () => {
    const clock = createTestClock();
    const tokens = createAccessTokens({ secret, clock });
    const token = await tokens.sign(claims);

    clock.advance((ACCESS_TOKEN_TTL_SECONDS - 10) * 1000);
    await expect(tokens.verify(token)).resolves.toEqual(claims);
    clock.advance(20 * 1000);
    await expect(tokens.verify(token)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });

  it('are refused when signed with another secret, unsigned, or tampered with', async () => {
    const clock = createTestClock();
    const tokens = createAccessTokens({ secret, clock });
    const foreign = await createAccessTokens({
      secret: randomBytes(32).toString('base64'),
      clock,
    }).sign(claims);
    const unsigned = new UnsecuredJWT({ sid: claims.sessionId, ev: true, auth_time: 1 })
      .setSubject(claims.userId)
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('15m')
      .encode();
    const [header, , signature] = (await tokens.sign(claims)).split('.');
    const tampered = [
      header,
      Buffer.from(JSON.stringify({ sub: 'someone-else', sid: 'x', ev: true })).toString(
        'base64url',
      ),
      signature,
    ].join('.');

    for (const token of [foreign, unsigned, tampered, 'not-a-jwt']) {
      await expect(tokens.verify(token)).rejects.toBeInstanceOf(InvalidAccessTokenError);
    }
  });

  it('are refused for another audience, or without the session claim', async () => {
    const clock = createTestClock();
    const tokens = createAccessTokens({ secret, clock });
    const key = new TextEncoder().encode(secret);
    const now = Math.floor(clock.now().getTime() / 1000);
    const otherAudience = await new SignJWT({ sid: 's', ev: true, auth_time: now })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u')
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setAudience('another-service')
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(key);
    const noSession = await new SignJWT({ ev: true, auth_time: now })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u')
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(key);

    await expect(tokens.verify(otherAudience)).rejects.toBeInstanceOf(InvalidAccessTokenError);
    await expect(tokens.verify(noSession)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });
});
