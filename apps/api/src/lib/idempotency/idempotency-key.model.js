import mongoose from 'mongoose';

/** Durée pendant laquelle une réponse peut être rejouée pour la même clé. */
export const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Durée au-delà de laquelle une requête « en cours » est considérée comme abandonnée
 * (processus arrêté pendant le traitement) : une nouvelle tentative peut alors la reprendre.
 */
export const IDEMPOTENCY_LOCK_MS = 60 * 1000;

/**
 * Collection technique idempotency_keys : une entrée par (portée, clé). Les index (unique sur
 * scope + key, TTL sur expiresAt) sont créés par migration. Collection de plateforme : filtrée
 * par sa portée et sa clé, jamais par eventId (voir l'ADR 0004).
 */
const idempotencyKeySchema = new mongoose.Schema(
  {
    /** Route et, s'il y en a un, compte appelant : « POST /auth/register ». */
    scope: { type: String, required: true },
    key: { type: String, required: true },
    /** Empreinte à clé de la requête (HMAC), sans les champs secrets. */
    fingerprint: { type: String, required: true },
    status: { type: String, enum: ['in_progress', 'completed'], required: true },
    lockedUntil: { type: Date, required: true },
    /** Réponse rejouée : jamais une réponse qui porte un secret (voir idempotent()). */
    response: {
      type: new mongoose.Schema(
        { status: { type: Number, required: true }, body: { type: mongoose.Schema.Types.Mixed } },
        { _id: false },
      ),
      default: null,
    },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'idempotency_keys', timestamps: true, autoIndex: false, autoCreate: false },
);

export const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencyKeySchema);
