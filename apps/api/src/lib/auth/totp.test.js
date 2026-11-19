import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  matchTotp,
  otpauthUri,
  totpStep,
} from './totp.js';

/** Secret des vecteurs de test des RFC 4226 et 6238 (SHA-1). */
const RFC_KEY = Buffer.from('12345678901234567890', 'ascii');

describe('HOTP (RFC 4226, appendix D)', () => {
  it.each([
    [0, '755224'],
    [1, '287082'],
    [2, '359152'],
    [3, '969429'],
    [9, '520489'],
  ])('gives the reference code for counter %i', (counter, code) => {
    expect(hotp(RFC_KEY, counter)).toBe(code);
  });
});

describe('TOTP (RFC 6238, appendix B, SHA-1)', () => {
  it.each([
    [59, '94287082'],
    [1_111_111_109, '07081804'],
    [1_234_567_890, '89005924'],
    [2_000_000_000, '69279037'],
  ])('gives the reference 8-digit code at %i s', (seconds, code) => {
    expect(hotp(RFC_KEY, totpStep(new Date(seconds * 1000)), 8)).toBe(code);
  });

  it('recognizes the current code, and the neighbouring steps only', () => {
    const secret = base32Encode(RFC_KEY);
    const now = new Date(1_234_567_890 * 1000);
    const step = totpStep(now);

    expect(matchTotp(secret, hotp(RFC_KEY, step), now)).toBe(step);
    expect(matchTotp(secret, hotp(RFC_KEY, step - 1), now)).toBe(step - 1);
    expect(matchTotp(secret, hotp(RFC_KEY, step + 1), now)).toBe(step + 1);
    expect(matchTotp(secret, hotp(RFC_KEY, step - 2), now)).toBeNull();
    expect(matchTotp(secret, 'abcdef', now)).toBeNull();
    expect(matchTotp(secret, '1234567', now)).toBeNull();
  });
});

describe('base32 and secrets', () => {
  it('round-trips, and matches the RFC 4648 reference', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    expect(base32Decode('mzxw6ytboi======').toString()).toBe('foobar');
    expect(() => base32Decode('MZXW1')).toThrow(TypeError);
  });

  it('generates 160-bit secrets, never twice the same', () => {
    const secrets = new Set(Array.from({ length: 200 }, generateTotpSecret));

    expect(secrets.size).toBe(200);
    for (const secret of secrets) {
      expect(base32Decode(secret)).toHaveLength(20);
    }
  });

  it('builds the otpauth URI understood by authenticator apps', () => {
    const uri = otpauthUri({ issuer: 'ALYORA', accountName: 'awa@exemple.ci', secret: 'ABC' });

    expect(uri).toBe(
      'otpauth://totp/ALYORA:awa%40exemple.ci?secret=ABC&issuer=ALYORA&algorithm=SHA1&digits=6&period=30',
    );
  });
});
