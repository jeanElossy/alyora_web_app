import { createHmac, hkdfSync } from 'node:crypto';

/**
 * Usages des empreintes à clé. Chacun a sa propre clé, dérivée du secret maître (HKDF) : une
 * empreinte faite pour un usage ne vaut rien pour un autre.
 */
export const KEYED_HASH_PURPOSES = Object.freeze(
  /** @type {const} */ (['ip', 'rate-limit', 'csrf', 'idempotency']),
);

/** @typedef {(typeof KEYED_HASH_PURPOSES)[number]} KeyedHashPurpose */

/**
 * Empreintes HMAC-SHA256 d'une valeur qu'on ne veut pas stocker en clair mais qu'on doit
 * reconnaître : l'IP d'une session, l'adresse e-mail dans une clé de rate limit, la signature
 * d'un jeton CSRF. Sans le secret, une empreinte ne se renverse pas, même pour une IP (dont
 * l'espace est petit) : c'est la différence avec un simple SHA-256.
 *
 * @param {string} masterSecret HASH_SECRET.
 */
export function createKeyedHasher(masterSecret) {
  /** @type {Map<KeyedHashPurpose, Buffer>} */
  const keys = new Map(
    KEYED_HASH_PURPOSES.map((purpose) => [
      purpose,
      Buffer.from(hkdfSync('sha256', masterSecret, 'alyora-keyed-hash', purpose, 32)),
    ]),
  );

  return {
    /**
     * @param {KeyedHashPurpose} purpose
     * @param {string} value
     * @returns {string} Empreinte en base64url.
     */
    digest(purpose, value) {
      const key = keys.get(purpose);
      if (!key) {
        throw new TypeError(`Unknown keyed hash purpose: ${String(purpose)}`);
      }
      return createHmac('sha256', key).update(value, 'utf8').digest('base64url');
    },
  };
}

/** @typedef {ReturnType<typeof createKeyedHasher>} KeyedHasher */
