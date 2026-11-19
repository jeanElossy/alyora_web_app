import mongoose from 'mongoose';

/**
 * Usages d'un jeton envoyé par e-mail. « invite » est réservé à l'invitation d'un
 * collaborateur (module à venir) : aucune route de M0.4 n'en émet.
 */
export const VERIFICATION_PURPOSES = Object.freeze(
  /** @type {const} */ (['email', 'reset', 'invite']),
);

/**
 * Collection verification_tokens : un jeton à usage unique envoyé par e-mail (256 bits
 * d'aléa, seule l'empreinte est stockée). Consommé par une mise à jour conditionnelle
 * (consumedAt: null), si bien que deux requêtes simultanées ne peuvent pas l'utiliser deux fois.
 *
 * Collection de plateforme, filtrée par tokenHash ou userId (exception tracée dans l'ADR 0004).
 * Index (migration) : tokenHash unique, userId + purpose, TTL sur expiresAt.
 */
const verificationTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    purpose: { type: String, enum: VERIFICATION_PURPOSES, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    /** Utilisé, ou remplacé par un jeton plus récent du même usage. */
    consumedAt: { type: Date, default: null },
  },
  {
    collection: 'verification_tokens',
    timestamps: { createdAt: true, updatedAt: false },
    autoIndex: false,
    autoCreate: false,
    strict: 'throw',
  },
);

export const VerificationToken = mongoose.model('VerificationToken', verificationTokenSchema);
