import { PERMISSIONS } from '@alyora/shared';
import mongoose from 'mongoose';
import { tenantScoped } from '../../../lib/tenancy/tenant-scope.plugin.js';

/** Longueur maximale du nom d'un rôle personnalisé. */
export const CUSTOM_ROLE_NAME_MAX_LENGTH = 60;

/**
 * Collection custom_roles : un rôle personnalisé, défini par une organisation et utilisable
 * sur ses seuls événements (le résolveur le cherche avec l'organisation du collaborateur).
 * Suppression logique (deletedAt) : un collaborateur qui le portait n'a plus aucune
 * permission, sans erreur.
 *
 * Cloisonnée par organizationId. Index (migration) : nom unique parmi les rôles non supprimés
 * d'une organisation.
 */
const customRoleSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true, maxlength: CUSTOM_ROLE_NAME_MAX_LENGTH },
    permissions: { type: [{ type: String, enum: PERMISSIONS }], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'custom_roles',
    timestamps: true,
    autoIndex: false,
    autoCreate: false,
    strict: 'throw',
  },
);

customRoleSchema.plugin(tenantScoped, { keys: ['organizationId'] });

export const CustomRole = mongoose.model('CustomRole', customRoleSchema);
