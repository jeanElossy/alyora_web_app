import mongoose from 'mongoose';
import { tenantScoped } from '../../../lib/tenancy/tenant-scope.plugin.js';

export const ORGANIZATION_MEMBER_STATUSES = Object.freeze(
  /** @type {const} */ (['active', 'removed']),
);

/**
 * Collection organization_members : l'appartenance d'un compte à une organisation. Elle ne
 * donne aucun accès implicite aux événements de l'organisation : seul un collaborateur en a
 * (ADR 0006). Ses droits propres (réglages, rôles personnalisés) viendront avec le module
 * des organisations. Retrait logique (status, removedAt).
 *
 * Cloisonnée par organizationId. Index (migration) : un seul membre actif par
 * (organizationId, userId).
 */
const organizationMemberSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: { type: String, enum: ORGANIZATION_MEMBER_STATUSES, default: 'active' },
    joinedAt: { type: Date, required: true },
    removedAt: { type: Date, default: null },
  },
  {
    collection: 'organization_members',
    timestamps: true,
    autoIndex: false,
    autoCreate: false,
    strict: 'throw',
  },
);

organizationMemberSchema.plugin(tenantScoped, { keys: ['organizationId'] });

export const OrganizationMember = mongoose.model('OrganizationMember', organizationMemberSchema);
