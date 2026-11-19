import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { KEYED_HASH_PURPOSES, createKeyedHasher } from './keyed-hash.js';
import { generateToken, hashToken, safeEqual } from './random-token.js';
import { DecryptionError, createSecretBox } from './secret-box.js';

describe('random tokens', () => {
  it('carry 256 bits of randomness, in 43 base64url characters, never twice the same', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateToken()));

    expect(tokens.size).toBe(1000);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it('are stored as a SHA-256 digest that never contains the token', () => {
    const token = generateToken();

    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).not.toBe(hashToken(generateToken()));
  });

  it('compare in constant time, including strings of different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('keyed hasher', () => {
  const hasher = createKeyedHasher(randomBytes(32).toString('base64'));

  it('gives a stable digest per purpose, and a different one for each purpose', () => {
    const digests = KEYED_HASH_PURPOSES.map((purpose) => hasher.digest(purpose, '203.0.113.7'));

    expect(new Set(digests).size).toBe(KEYED_HASH_PURPOSES.length);
    expect(hasher.digest('ip', '203.0.113.7')).toBe(digests[0]);
  });

  it('cannot be reproduced without the secret', () => {
    const other = createKeyedHasher(randomBytes(32).toString('base64'));

    expect(other.digest('ip', '203.0.113.7')).not.toBe(hasher.digest('ip', '203.0.113.7'));
  });

  it('refuses an unknown purpose', () => {
    expect(() => hasher.digest(/** @type {any} */ ('session'), 'x')).toThrow(
      /Unknown keyed hash purpose/,
    );
  });
});

describe('secret box (AES-256-GCM)', () => {
  const box = createSecretBox(randomBytes(32));

  it('decrypts what it encrypted, with a new IV each time', () => {
    const first = box.encrypt('JBSWY3DPEHPK3PXP', 'totp:user-1');
    const second = box.encrypt('JBSWY3DPEHPK3PXP', 'totp:user-1');

    expect(first).not.toBe(second);
    expect(first).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.decrypt(first, 'totp:user-1')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('refuses a ciphertext decrypted for another use, or with another key', () => {
    const sealed = box.encrypt('secret', 'totp:user-1');

    expect(() => box.decrypt(sealed, 'totp:user-2')).toThrow(DecryptionError);
    expect(() => createSecretBox(randomBytes(32)).decrypt(sealed, 'totp:user-1')).toThrow(
      DecryptionError,
    );
  });

  it('refuses a tampered or malformed ciphertext', () => {
    const [version, iv, tag, data] = box.encrypt('secret', 'mail:v1').split('.');
    const flipped = `${data?.startsWith('A') ? 'B' : 'A'}${data?.slice(1)}`;

    expect(() => box.decrypt([version, iv, tag, flipped].join('.'), 'mail:v1')).toThrow(
      DecryptionError,
    );
    expect(() => box.decrypt('v2.a.b.c', 'mail:v1')).toThrow(DecryptionError);
    expect(() => box.decrypt('v1.a.b', 'mail:v1')).toThrow(DecryptionError);
    expect(() => box.decrypt('v1.a.b.c.d', 'mail:v1')).toThrow(DecryptionError);
  });

  it('needs a 32-byte key', () => {
    expect(() => createSecretBox(randomBytes(16))).toThrow(/32 bytes/);
  });
});
