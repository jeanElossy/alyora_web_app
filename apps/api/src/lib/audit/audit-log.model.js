import mongoose from 'mongoose';
import { appendOnly } from '../db/append-only.plugin.js';
import { tenantScoped } from '../tenancy/tenant-scope.plugin.js';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from './audit-actions.js';

/** Longueur maximale du User-Agent conservé. */
export const AUDIT_USER_AGENT_MAX_LENGTH = 512;

/**
 * Collection audit_logs : qui a fait quoi, sur quoi, quand et d'où. Écrite uniquement par le
 * service d'audit (audit-log.js), dans la transaction de l'action journalisée. En ajout seul :
 * aucune entrée ne se modifie ni ne se supprime.
 *
 * L'IP n'est jamais conservée en clair : seulement son empreinte à clé, la même que celle des
 * sessions, ce qui permet de rapprocher une action d'une session sans exposer l'adresse.
 *
 * Cloisonnée par organizationId (toujours renseigné) ou eventId. Index (migration) :
 * (organizationId, createdAt) et (eventId, createdAt).
 */
const auditLogSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    /** Null pour une action sur l'organisation elle-même (rôle personnalisé). */
    eventId: { type: mongoose.Schema.Types.ObjectId, default: null },
    /** Compte qui agit ; null pour une action du système. */
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    targetType: { type: String, enum: AUDIT_TARGET_TYPES, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    /** Instantanés minimaux, sans secret ni coordonnée (vérifié par le service). */
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    ipHash: { type: String, default: null },
    userAgent: { type: String, default: '' },
    createdAt: { type: Date, required: true },
  },
  {
    collection: 'audit_logs',
    timestamps: false,
    autoIndex: false,
    autoCreate: false,
    strict: 'throw',
    minimize: false,
  },
);

auditLogSchema.plugin(tenantScoped, { keys: ['organizationId', 'eventId'] });
auditLogSchema.plugin(appendOnly);

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
