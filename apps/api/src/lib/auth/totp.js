import { createHmac, randomBytes } from 'node:crypto';
import { safeEqual } from '../crypto/random-token.js';

// Mots de passe à usage unique fondés sur le temps (TOTP, RFC 6238, sur HOTP, RFC 4226), sans
// bibliothèque : HMAC-SHA1, pas de 30 secondes, 6 chiffres, les réglages que toutes les
// applications d'authentification comprennent (Google Authenticator, Authy, 1Password...).

/** Durée d'un pas, en secondes. */
export const TOTP_PERIOD_SECONDS = 30;

/** Nombre de chiffres d'un code. */
export const TOTP_DIGITS = 6;

/** Pas acceptés de part et d'autre du pas courant : l'horloge du téléphone peut dériver. */
export const TOTP_WINDOW = 1;

/** Taille du secret : 160 bits, la longueur recommandée pour HMAC-SHA1 (RFC 4226). */
const SECRET_BYTES = 20;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Base32 (RFC 4648), sans remplissage : le format des secrets TOTP.
 *
 * @param {Buffer} bytes
 * @returns {string}
 */
export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * @param {string} encoded
 * @returns {Buffer}
 * @throws {TypeError} Pour un caractère hors de l'alphabet.
 */
export function base32Decode(encoded) {
  const clean = encoded.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  /** @type {number[]} */
  const bytes = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new TypeError('Invalid base32 character');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** @returns {string} Un nouveau secret, en base32. */
export function generateTotpSecret() {
  return base32Encode(randomBytes(SECRET_BYTES));
}

/**
 * Code HOTP d'un compteur (RFC 4226, troncature dynamique).
 *
 * @param {Buffer} key
 * @param {number} counter
 * @param {number} [digits]
 * @returns {string}
 */
export function hotp(key, counter, digits = TOTP_DIGITS) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(message).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * Pas de temps d'une date.
 *
 * @param {Date} date
 * @returns {number}
 */
export function totpStep(date) {
  return Math.floor(date.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

/**
 * Cherche le pas dont le code correspond, dans la fenêtre autour de `now`, en comparant en
 * temps constant. Ne dit rien du rejeu : l'appelant refuse un pas déjà utilisé.
 *
 * @param {string} secret En base32.
 * @param {string} code
 * @param {Date} now
 * @returns {number | null} Le pas reconnu, ou null.
 */
export function matchTotp(secret, code, now) {
  if (!/^\d{6}$/.test(code)) {
    return null;
  }
  const key = base32Decode(secret);
  const current = totpStep(now);
  /** @type {number | null} */
  let matched = null;
  // Tous les pas de la fenêtre sont calculés, même après une correspondance : la durée ne
  // dépend pas du pas reconnu.
  for (let step = current - TOTP_WINDOW; step <= current + TOTP_WINDOW; step += 1) {
    if (safeEqual(hotp(key, step), code) && matched === null) {
      matched = step;
    }
  }
  return matched;
}

/**
 * URI otpauth:// à présenter en QR code à l'application d'authentification.
 *
 * @param {{ issuer: string, accountName: string, secret: string }} options
 * @returns {string}
 */
export function otpauthUri({ issuer, accountName, secret }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params}`;
}
