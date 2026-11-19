import { ACCOUNT_TYPES, DEFAULT_LOCALE, DEFAULT_TIMEZONE, LOCALES } from '@alyora/shared';
import mongoose from 'mongoose';

export const USER_STATUSES = Object.freeze(/** @type {const} */ (['active', 'disabled']));

/**
 * Collection users : un compte de la plateforme. Collection de plateforme, hors de tout
 * événement : filtrée par _id ou par e-mail, jamais par eventId (exception tracée dans
 * l'ADR 0004). Index (créés par migration) :
 * - e-mail unique parmi les comptes non supprimés (deletedAt null) : une adresse ne désigne
 *   qu'un compte vivant, et peut resservir après une suppression logique.
 *
 * passwordHash et twoFactorSecret ne sont jamais lus sauf demande explicite (select: false) :
 * un oubli dans une projection ne les fait pas sortir.
 */
const userSchema = new mongoose.Schema(
  {
    /** Normalisée (minuscules, sans espaces) par emailSchema de @alyora/shared. */
    email: { type: String, required: true },
    /** argon2id, au format PHC. */
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    /** E.164 ; aucune vérification n'est proposée dans M0.4 (phoneVerifiedAt reste vide). */
    phone: { type: String, default: null },
    accountType: { type: String, enum: ACCOUNT_TYPES, required: true },
    emailVerifiedAt: { type: Date, default: null },
    phoneVerifiedAt: { type: Date, default: null },
    twoFactorEnabled: { type: Boolean, default: false },
    /** Chiffré au repos (AES-256-GCM, voir secret-box.js). Jamais en clair. */
    twoFactorSecret: { type: String, default: null, select: false },
    /** Échecs de connexion consécutifs, remis à zéro par une connexion réussie. */
    failedLoginCount: { type: Number, default: 0 },
    /** Verrouillage temporaire, levé automatiquement à cette date. */
    lockedUntil: { type: Date, default: null },
    /** Nombre de verrouillages déjà subis : chacun dure deux fois plus que le précédent. */
    lockoutCount: { type: Number, default: 0 },
    avatarUrl: { type: String, default: null },
    locale: { type: String, enum: LOCALES, default: DEFAULT_LOCALE },
    timezone: { type: String, default: DEFAULT_TIMEZONE },
    status: { type: String, enum: USER_STATUSES, default: 'active' },
    passwordChangedAt: { type: Date, default: null },
    /** Suppression logique, jamais physique. */
    deletedAt: { type: Date, default: null },
  },
  { collection: 'users', timestamps: true, autoIndex: false, autoCreate: false, strict: 'throw' },
);

export const User = mongoose.model('User', userSchema);

/** @typedef {mongoose.InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId }} UserRecord */
