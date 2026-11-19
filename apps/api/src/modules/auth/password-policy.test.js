import { describe, expect, it } from 'vitest';
import { assertAcceptablePassword, passwordWeakness } from './password-policy.js';
import { describeDevice, truncateUserAgent } from './device-label.js';

const account = { email: 'awa.kone@exemple.ci', firstName: 'Awa', lastName: 'Koné' };

describe('passwordWeakness', () => {
  it.each([
    ['1234567890', 'password_too_common'],
    ['QWERTYUIOP', 'password_too_common'],
    ['azertyuiop', 'password_too_common'],
    ['motdepasse123', 'password_too_common'],
    ['xyxyxyxyxyxy', 'password_too_repetitive'],
    ['ç3ç3ç3ç3ç3ç3', 'password_too_repetitive'],
    ['awa.kone-2026!', 'password_contains_personal_info'],
    ['Mariage de KONÉ 2026', 'password_contains_personal_info'],
    ['mon compte alyora !', 'password_contains_personal_info'],
  ])('refuses %s (%s)', (password, weakness) => {
    expect(passwordWeakness(password, account)).toBe(weakness);
  });

  it('accepts a passphrase without composition rules', () => {
    expect(passwordWeakness('le soleil se lève sur la lagune', account)).toBeNull();
    expect(passwordWeakness('tournesol bleu marine', account)).toBeNull();
  });

  it('ignores personal words too short to matter', () => {
    expect(passwordWeakness('awa aime les mangues', { ...account, firstName: 'Awa' })).toBeNull();
  });
});

describe('assertAcceptablePassword', () => {
  it('throws a validation error on the password field, without the password', () => {
    let thrown;
    try {
      assertAcceptablePassword('1234567890', account);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { issues: [{ path: 'password', code: 'password_too_common' }] },
    });
    expect(JSON.stringify(thrown)).not.toContain('1234567890');
  });
});

describe('describeDevice', () => {
  it.each([
    [
      'Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
      'Chrome · Android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      'Safari · iOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0',
      'Edge · Windows',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:133.0) Gecko/20100101 Firefox/133.0',
      'Firefox · macOS',
    ],
    ['curl/8.5.0', 'Unknown · Unknown'],
  ])('labels %s', (userAgent, label) => {
    expect(describeDevice(userAgent)).toBe(label);
  });

  it('keeps at most 512 characters of the User-Agent', () => {
    expect(truncateUserAgent('x'.repeat(2000))).toHaveLength(512);
    expect(truncateUserAgent(undefined)).toBe('');
  });
});
