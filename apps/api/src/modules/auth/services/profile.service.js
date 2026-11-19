import { AppError } from '../../../lib/errors/app-error.js';
import { User } from '../models/user.model.js';
import { toCurrentUser } from './auth-service-deps.js';
import { requireUserId } from './session-tokens.js';

/** @typedef {import('./auth-service-deps.js').ServiceContext} ServiceContext */

/** Champs lus pour la vue « mon compte » : jamais le hash ni le secret 2FA. */
const PROFILE_FIELDS = {
  email: 1,
  firstName: 1,
  lastName: 1,
  phone: 1,
  accountType: 1,
  emailVerifiedAt: 1,
  phoneVerifiedAt: 1,
  twoFactorEnabled: 1,
  avatarUrl: 1,
  locale: 1,
  timezone: 1,
  createdAt: 1,
};

/** Profil du compte connecté. */
export function createProfileService() {
  return {
    /**
     * @param {ServiceContext} context
     * @returns {Promise<import('@alyora/shared/schemas').CurrentUser>}
     */
    async me(context) {
      const user = await User.findOne(
        { _id: requireUserId(context), deletedAt: null, status: 'active' },
        PROFILE_FIELDS,
      ).lean();
      if (!user) {
        throw new AppError('UNAUTHENTICATED');
      }
      return toCurrentUser(user);
    },

    /**
     * Modifie les champs reçus seulement. L'adresse e-mail et le mot de passe ne se changent
     * pas ici.
     *
     * @param {ServiceContext} context
     * @param {import('@alyora/shared/schemas').UpdateProfileRequest} changes
     * @returns {Promise<import('@alyora/shared/schemas').CurrentUser>}
     */
    async update(context, changes) {
      const user = await User.findOneAndUpdate(
        { _id: requireUserId(context), deletedAt: null, status: 'active' },
        { $set: changes },
        { returnDocument: 'after', projection: PROFILE_FIELDS },
      ).lean();
      if (!user) {
        throw new AppError('UNAUTHENTICATED');
      }
      return toCurrentUser(user);
    },
  };
}
