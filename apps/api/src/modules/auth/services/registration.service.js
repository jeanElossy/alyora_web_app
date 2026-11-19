import { EMAIL_VERIFICATION_TTL_SECONDS } from '@alyora/shared';
import { generateToken, hashToken } from '../../../lib/crypto/random-token.js';
import { isDuplicateKeyError, withTransaction } from '../../../lib/db/transaction.js';
import { User } from '../models/user.model.js';
import { VerificationToken } from '../models/verification-token.model.js';
import { assertAcceptablePassword } from '../password-policy.js';
import { sendSafely } from './auth-service-deps.js';

/** @typedef {import('./auth-service-deps.js').AuthServiceDeps} AuthServiceDeps */
/** @typedef {import('./auth-service-deps.js').ServiceContext} ServiceContext */

/** Ce qu'il faut d'un compte pour lui écrire. */
const RECIPIENT_FIELDS = { email: 1, firstName: 1, timezone: 1 };

/**
 * Inscription. La réponse est toujours la même (« demande acceptée »), que l'adresse ait déjà
 * un compte ou non : sinon, l'inscription servirait à tester l'existence d'un compte.
 * - adresse libre : le compte est créé, non vérifié, avec un lien de vérification (24 h) ;
 * - adresse déjà prise : rien n'est créé ni modifié ; le titulaire reçoit un e-mail qui le
 *   prévient de la tentative.
 * Le mot de passe est haché avant la transaction, dans les deux cas : la durée ne trahit rien.
 *
 * @param {AuthServiceDeps} deps
 */
export function createRegistrationService(deps) {
  const { clock, passwordHasher, emails, logger } = deps;

  return {
    /**
     * @param {ServiceContext} _context
     * @param {import('@alyora/shared/schemas').RegisterRequest} input
     * @returns {Promise<void>}
     */
    async register(_context, input) {
      assertAcceptablePassword(input.password, input);
      const passwordHash = await passwordHasher.hash(input.password);
      const now = clock.now();

      /** @type {{ kind: 'created', user: { _id: import('mongoose').Types.ObjectId, email: string, firstName: string, timezone: string }, token: string } | { kind: 'exists', user: { _id: import('mongoose').Types.ObjectId, email: string, firstName: string, timezone: string } | null }} */
      let outcome;
      try {
        outcome = await withTransaction(async (session) => {
          const existing = await User.findOne(
            { email: input.email, deletedAt: null },
            RECIPIENT_FIELDS,
            { session },
          ).lean();
          if (existing) {
            return /** @type {const} */ ({ kind: 'exists', user: existing });
          }
          const [user] = await User.create(
            [
              {
                email: input.email,
                passwordHash,
                firstName: input.firstName,
                lastName: input.lastName,
                phone: input.phone ?? null,
                accountType: input.accountType,
                locale: input.locale,
                timezone: input.timezone,
                passwordChangedAt: now,
              },
            ],
            { session },
          );
          const token = generateToken();
          await VerificationToken.create(
            [
              {
                userId: user._id,
                purpose: 'email',
                tokenHash: hashToken(token),
                expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_SECONDS * 1000),
              },
            ],
            { session },
          );
          return /** @type {const} */ ({ kind: 'created', user, token });
        });
      } catch (error) {
        // Deux inscriptions simultanées de la même adresse : l'index unique a départagé, et
        // celle-ci a perdu. Même traitement qu'une adresse déjà prise.
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
        outcome = {
          kind: 'exists',
          user: await User.findOne(
            { email: input.email, deletedAt: null },
            RECIPIENT_FIELDS,
          ).lean(),
        };
      }

      if (outcome.kind === 'created') {
        logger.info(
          { event: 'auth.registered', userId: outcome.user._id.toString() },
          'Account created',
        );
        await sendSafely(deps, emails.verifyEmail(outcome.user, outcome.token), 'verify_email');
        return;
      }
      if (outcome.user) {
        logger.info(
          { event: 'auth.registration_on_existing_account', userId: outcome.user._id.toString() },
          'Registration attempted with an address that already has an account',
        );
        await sendSafely(deps, emails.accountExists(outcome.user), 'account_exists');
      }
    },
  };
}
