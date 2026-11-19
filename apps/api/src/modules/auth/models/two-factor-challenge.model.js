import mongoose from 'mongoose';

/**
 * Collection two_factor_challenges : la seconde étape d'une connexion dont le mot de passe est
 * vérifié, quand la 2FA est active. Le client reçoit un jeton (256 bits, seule l'empreinte est
 * stockée), valable 5 minutes, à présenter avec un code. Consommé une seule fois (mise à jour
 * conditionnelle), annulé après 5 codes faux.
 *
 * Collection de plateforme, filtrée par tokenHash (exception tracée dans l'ADR 0004). Index
 * (migration) : tokenHash unique, TTL sur expiresAt.
 */
const twoFactorChallengeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    failedAttempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
  },
  {
    collection: 'two_factor_challenges',
    timestamps: { createdAt: true, updatedAt: false },
    autoIndex: false,
    autoCreate: false,
    strict: 'throw',
  },
);

export const TwoFactorChallenge = mongoose.model('TwoFactorChallenge', twoFactorChallengeSchema);
