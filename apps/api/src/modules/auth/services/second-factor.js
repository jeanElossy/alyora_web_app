import { randomBytes } from 'node:crypto';
import { BACKUP_CODE_COUNT } from '@alyora/shared';
import { base32Encode, matchTotp } from '../../../lib/auth/totp.js';
import { User } from '../models/user.model.js';

/**
 * Vérification du second facteur : code TOTP (une seule fois par pas) ou code de secours (une
 * seule fois en tout). Les deux consommations sont des mises à jour conditionnelles, atomiques :
 * un code intercepté et rejoué, même dans la même seconde, est refusé.
 *
 * @param {object} deps
 * @param {import('../../../lib/crypto/secret-box.js').SecretBox} deps.secretBox
 * @param {import('../../../lib/crypto/keyed-hash.js').KeyedHasher} deps.keyedHasher
 */
export function createSecondFactor({ secretBox, keyedHasher }) {
  /** @param {import('mongoose').Types.ObjectId} userId */
  const context = (userId) => `totp:${userId.toString()}`;

  /**
   * Empreinte d'un code de secours, liée au compte : un code ne vaut pour aucun autre compte.
   *
   * @param {import('mongoose').Types.ObjectId} userId
   * @param {string} code Normalisé (10 caractères base32, sans tiret).
   */
  const backupHash = (userId, code) =>
    keyedHasher.digest('backup-code', `${userId.toString()}:${code}`);

  /**
   * @param {import('mongoose').Types.ObjectId} userId
   * @param {string} sealedSecret
   * @param {string} code
   * @param {Date} now
   * @returns {Promise<boolean>}
   */
  async function consumeTotp(userId, sealedSecret, code, now) {
    const step = matchTotp(secretBox.decrypt(sealedSecret, context(userId)), code, now);
    if (step === null) {
      return false;
    }
    const accepted = await User.updateOne(
      {
        _id: userId,
        $or: [{ twoFactorLastStep: null }, { twoFactorLastStep: { $lt: step } }],
      },
      { $set: { twoFactorLastStep: step } },
    );
    return accepted.modifiedCount === 1;
  }

  /**
   * @param {import('mongoose').Types.ObjectId} userId
   * @param {string} code
   * @param {Date} now
   * @returns {Promise<boolean>}
   */
  async function consumeBackupCode(userId, code, now) {
    const used = await User.updateOne(
      {
        _id: userId,
        twoFactorBackupCodes: { $elemMatch: { hash: backupHash(userId, code), usedAt: null } },
      },
      { $set: { 'twoFactorBackupCodes.$.usedAt': now } },
    );
    return used.modifiedCount === 1;
  }

  return {
    /**
     * @param {import('mongoose').Types.ObjectId} userId
     * @param {string} secret En base32.
     * @returns {string} Le secret chiffré, lié au compte.
     */
    seal: (userId, secret) => secretBox.encrypt(secret, context(userId)),

    /**
     * @param {import('mongoose').Types.ObjectId} userId
     * @param {string} sealed
     * @returns {string}
     */
    open: (userId, sealed) => secretBox.decrypt(sealed, context(userId)),

    /**
     * Vérifie et consomme un second facteur du compte (2FA active).
     *
     * @param {{ _id: import('mongoose').Types.ObjectId, twoFactorSecret?: string | null }} user
     *   Lu avec `+twoFactorSecret`.
     * @param {{ otp?: string, backupCode?: string }} factor
     * @param {Date} now
     * @returns {Promise<boolean>}
     */
    async verify(user, { otp, backupCode }, now) {
      if (otp !== undefined && user.twoFactorSecret) {
        return consumeTotp(user._id, user.twoFactorSecret, otp, now);
      }
      if (backupCode !== undefined) {
        return consumeBackupCode(user._id, backupCode, now);
      }
      return false;
    },

    /**
     * Huit nouveaux codes de secours de 50 bits (10 caractères base32), présentés « ABCDE-FGH23 ».
     * Seules leurs empreintes à clé sont stockées.
     *
     * @param {import('mongoose').Types.ObjectId} userId
     * @returns {{ codes: string[], records: { hash: string, usedAt: null }[] }}
     */
    generateBackupCodes(userId) {
      const raw = Array.from({ length: BACKUP_CODE_COUNT }, () =>
        base32Encode(randomBytes(7)).slice(0, 10),
      );
      return {
        codes: raw.map((code) => `${code.slice(0, 5)}-${code.slice(5)}`),
        records: raw.map((code) => ({ hash: backupHash(userId, code), usedAt: null })),
      };
    },
  };
}

/** @typedef {ReturnType<typeof createSecondFactor>} SecondFactor */
