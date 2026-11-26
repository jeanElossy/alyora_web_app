import mongoose from 'mongoose';
import QRCode from 'qrcode';
import { generateTotpSecret, matchTotp, otpauthUri } from '../../../lib/auth/totp.js';
import { withTransaction } from '../../../lib/db/transaction.js';
import { AppError } from '../../../lib/errors/app-error.js';
import { User } from '../models/user.model.js';
import { sendSafely } from './auth-service-deps.js';
import { requireUserId, revokeSessions } from './session-tokens.js';

/** @typedef {import('./auth-service-deps.js').AuthServiceDeps} AuthServiceDeps */
/** @typedef {import('./auth-service-deps.js').ServiceContext} ServiceContext */

/** Nom affiché par l'application d'authentification. */
export const TOTP_ISSUER = 'ALYORA';

const ACTIVE_ACCOUNT = /** @type {const} */ ({ deletedAt: null, status: 'active' });

/**
 * Gestion de la double authentification (TOTP) : réglage, activation, désactivation. Les
 * trois routes exigent une authentification récente (requireRecentAuth).
 *
 * @param {AuthServiceDeps} deps
 * @param {object} collaborators
 * @param {import('./account-lock.js').AccountLock} collaborators.lock
 * @param {import('./second-factor.js').SecondFactor} collaborators.secondFactor
 */
export function createTwoFactorService(deps, { lock, secondFactor }) {
  const { clock, logger, emails } = deps;

  return {
    /**
     * Vrai si la double authentification est active sur un compte actif : condition des
     * opérations les plus sensibles (transfert de propriété).
     *
     * @param {string} userId
     * @returns {Promise<boolean>}
     */
    async isEnabled(userId) {
      return Boolean(await User.exists({ _id: userId, ...ACTIVE_ACCOUNT, twoFactorEnabled: true }));
    },

    /**
     * Prépare un nouveau secret, chiffré, en attente d'activation, et le QR code à scanner
     * (généré par le serveur, en SVG). Un réglage précédent non activé est remplacé.
     *
     * @param {ServiceContext} context
     * @returns {Promise<{ secret: string, otpauthUri: string, qrCodeDataUrl: string }>}
     * @throws {AppError} TWO_FACTOR_CONFLICT si la 2FA est déjà active.
     */
    async setup(context) {
      const userId = requireUserId(context);
      const secret = generateTotpSecret();
      const user = await User.findOneAndUpdate(
        { _id: userId, ...ACTIVE_ACCOUNT, twoFactorEnabled: false },
        { $set: { twoFactorPendingSecret: secondFactor.seal(userId, secret) } },
        { returnDocument: 'after', projection: { email: 1 } },
      ).lean();
      if (!user) {
        throw new AppError('TWO_FACTOR_CONFLICT');
      }
      const uri = otpauthUri({ issuer: TOTP_ISSUER, accountName: user.email, secret });
      const svg = await QRCode.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
      return {
        secret,
        otpauthUri: uri,
        qrCodeDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      };
    },

    /**
     * Active la 2FA avec un premier code, qui prouve que l'application est réglée. Remet huit
     * codes de secours, une seule fois. Les autres sessions du compte, ouvertes sans second
     * facteur, sont révoquées.
     *
     * @param {ServiceContext} context
     * @param {{ otp: string }} input
     * @returns {Promise<string[]>} Les codes de secours.
     */
    async enable(context, { otp }) {
      const userId = requireUserId(context);
      const now = clock.now();
      const user = await User.findOne({ _id: userId, ...ACTIVE_ACCOUNT })
        .select('+twoFactorPendingSecret')
        .lean();
      if (!user || user.twoFactorEnabled || !user.twoFactorPendingSecret) {
        throw new AppError('TWO_FACTOR_CONFLICT');
      }
      const sealed = user.twoFactorPendingSecret;
      // Essai réservé avant la vérification du code (voir account-lock.js).
      if (!(await lock.reserveAttempt(userId, now))) {
        throw new AppError('INVALID_TWO_FACTOR_CODE');
      }
      const step = matchTotp(secondFactor.open(userId, sealed), otp, now);
      if (step === null) {
        await lock.recordFailure(userId, now);
        throw new AppError('INVALID_TWO_FACTOR_CODE');
      }
      await lock.releaseAttempt(userId);
      const { codes, records } = secondFactor.generateBackupCodes(userId);
      await withTransaction(async (session) => {
        const enabled = await User.updateOne(
          { _id: userId, twoFactorEnabled: false, twoFactorPendingSecret: sealed },
          {
            $set: {
              twoFactorEnabled: true,
              twoFactorSecret: sealed,
              twoFactorPendingSecret: null,
              twoFactorLastStep: step,
              twoFactorBackupCodes: records,
              twoFactorEnabledAt: now,
            },
          },
          { session },
        );
        if (enabled.modifiedCount !== 1) {
          throw new AppError('TWO_FACTOR_CONFLICT');
        }
        // L'identifiant est converti : comparé sous forme de texte à un ObjectId, $ne serait
        // toujours vrai, et la session courante serait révoquée avec les autres.
        const current = context.authSessionId
          ? new mongoose.Types.ObjectId(context.authSessionId)
          : null;
        await revokeSessions(session, { userId, _id: { $ne: current } }, 'two_factor_enabled', now);
      });
      logger.info({ event: 'auth.two_factor_enabled', userId: userId.toString() }, '2FA enabled');
      await sendSafely(deps, emails.twoFactorEnabled(user), 'two_factor_enabled');
      return codes;
    },

    /**
     * Désactive la 2FA, avec un code de l'application ou un code de secours. Le secret et les
     * codes de secours sont effacés.
     *
     * @param {ServiceContext} context
     * @param {import('@alyora/shared/schemas').TwoFactorDisableRequest} input
     * @returns {Promise<void>}
     */
    async disable(context, input) {
      const userId = requireUserId(context);
      const now = clock.now();
      const user = await User.findOne({ _id: userId, ...ACTIVE_ACCOUNT, twoFactorEnabled: true })
        .select('+twoFactorSecret')
        .lean();
      if (!user) {
        throw new AppError('TWO_FACTOR_CONFLICT');
      }
      // Essai réservé avant la vérification du code (voir account-lock.js).
      if (!(await lock.reserveAttempt(userId, now))) {
        throw new AppError('INVALID_TWO_FACTOR_CODE');
      }
      if (!(await secondFactor.verify(user, input, now))) {
        await lock.recordFailure(userId, now);
        throw new AppError('INVALID_TWO_FACTOR_CODE');
      }
      await lock.releaseAttempt(userId);
      await User.updateOne(
        { _id: userId, twoFactorEnabled: true },
        {
          $set: {
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorPendingSecret: null,
            twoFactorLastStep: null,
            twoFactorBackupCodes: [],
            twoFactorEnabledAt: null,
          },
        },
      );
      logger.info({ event: 'auth.two_factor_disabled', userId: userId.toString() }, '2FA disabled');
      await sendSafely(deps, emails.twoFactorDisabled(user), 'two_factor_disabled');
    },
  };
}
