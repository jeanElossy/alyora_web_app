import mongoose from 'mongoose';

/**
 * Collection sessions : un appareil connecté à un compte. Une session se révoque (revokedAt),
 * jamais ne s'efface : c'est l'historique de sécurité du compte. Collection de plateforme,
 * filtrée par userId (exception tracée dans l'ADR 0004). Index (migration) : userId +
 * revokedAt + lastSeenAt, pour la liste des sessions actives.
 *
 * Nommée AuthSession dans le code, pour ne pas la confondre avec la session transactionnelle
 * MongoDB que reçoivent les services.
 */
const authSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    /** Navigateur et système, déduits du User-Agent (« Chrome · Android »). */
    deviceLabel: { type: String, required: true },
    /** User-Agent tronqué à 512 caractères. */
    userAgent: { type: String, default: '' },
    /** Empreinte à clé de l'IP de connexion (HMAC) : jamais l'IP en clair. */
    ipHash: { type: String, required: true },
    lastSeenAt: { type: Date, required: true },
    /** Dernière authentification complète (mot de passe, puis 2FA) : requireRecentAuth. */
    authenticatedAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    /** Pourquoi : logout, logout_all, revoked, password_reset, refresh_reuse, session_limit. */
    revokedReason: { type: String, default: null },
    /** Fin de validité du dernier refresh token émis (30 jours, glissants). */
    expiresAt: { type: Date, required: true },
  },
  {
    collection: 'sessions',
    timestamps: { createdAt: true, updatedAt: true },
    autoIndex: false,
    autoCreate: false,
    strict: 'throw',
  },
);

export const AuthSession = mongoose.model('AuthSession', authSessionSchema);
