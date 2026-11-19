import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Aléa d'un jeton : 256 bits. */
export const TOKEN_BYTES = 32;

/**
 * Jeton aléatoire, en base64url (43 caractères pour 256 bits). Sert aux refresh tokens et aux
 * liens envoyés par e-mail. Le jeton en clair ne quitte que la réponse ou l'e-mail : seule son
 * empreinte (hashToken) est stockée.
 *
 * @param {number} [bytes]
 * @returns {string}
 */
export function generateToken(bytes = TOKEN_BYTES) {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Empreinte SHA-256 d'un jeton, telle qu'elle est stockée et cherchée en base. Un hachage
 * lent (argon2) est inutile ici : 256 bits d'aléa ne se devinent pas, contrairement à un mot
 * de passe. Sans sel, pour pouvoir chercher le jeton par son empreinte.
 *
 * @param {string} token
 * @returns {string}
 */
export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

/**
 * Comparaison en temps constant de deux chaînes (jetons, signatures) : la durée ne dépend pas
 * de la position du premier caractère différent.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function safeEqual(a, b) {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
