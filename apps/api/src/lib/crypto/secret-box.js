import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1';

/** Levée quand un texte chiffré est illisible : altéré, tronqué, ou chiffré pour un autre usage. */
export class DecryptionError extends Error {
  constructor() {
    super('Unable to decrypt the value');
    this.name = 'DecryptionError';
  }
}

/**
 * Chiffrement authentifié (AES-256-GCM) des données sensibles stockées : secret 2FA en base,
 * contenu des e-mails en file d'attente. Format : « v1.<iv>.<tag>.<chiffré> » en base64url,
 * avec un IV aléatoire à chaque chiffrement.
 *
 * Le `context` (données associées) lie le chiffré à son usage : un secret 2FA chiffré pour un
 * compte ne se déchiffre pas pour un autre, même recopié en base.
 *
 * @param {Buffer} key 32 octets (DATA_ENCRYPTION_KEY).
 */
export function createSecretBox(key) {
  if (key.length !== 32) {
    throw new TypeError('createSecretBox(): the key must be 32 bytes long');
  }

  return {
    /**
     * @param {string} plaintext
     * @param {string} context Usage du chiffré (« mail », « totp:<userId> »...).
     * @returns {string}
     */
    encrypt(plaintext, context) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
      cipher.setAAD(Buffer.from(context, 'utf8'));
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [VERSION, iv, cipher.getAuthTag(), encrypted]
        .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
        .join('.');
    },

    /**
     * @param {string} sealed
     * @param {string} context Le même qu'au chiffrement.
     * @returns {string}
     * @throws {DecryptionError}
     */
    decrypt(sealed, context) {
      const [version, iv, tag, encrypted, ...rest] = sealed.split('.');
      if (version !== VERSION || !iv || !tag || encrypted === undefined || rest.length > 0) {
        throw new DecryptionError();
      }
      try {
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'), {
          authTagLength: TAG_BYTES,
        });
        decipher.setAAD(Buffer.from(context, 'utf8'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([
          decipher.update(Buffer.from(encrypted, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        throw new DecryptionError();
      }
    },
  };
}

/** @typedef {ReturnType<typeof createSecretBox>} SecretBox */
