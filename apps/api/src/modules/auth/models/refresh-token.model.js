import mongoose from 'mongoose';

/**
 * Collection refresh_tokens : un refresh token émis. Seule son empreinte (SHA-256) est
 * stockée. Chaque usage le consomme (usedAt) et le remplace (replacedBy) : c'est la rotation.
 * Tous les jetons nés d'une même connexion forment une famille (familyId) : présenter un
 * jeton déjà consommé est un vol présumé, qui révoque toute la famille.
 *
 * Collection de plateforme, filtrée par tokenHash, familyId ou sessionId (exception tracée
 * dans l'ADR 0004). Index (migration) : tokenHash unique, familyId, sessionId, et un TTL sur
 * expiresAt qui efface les jetons expirés (aucune valeur métier ni d'historique).
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    familyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true },
    usedAt: { type: Date, default: null },
    replacedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  {
    collection: 'refresh_tokens',
    timestamps: { createdAt: true, updatedAt: false },
    autoIndex: false,
    autoCreate: false,
    strict: 'throw',
  },
);

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
