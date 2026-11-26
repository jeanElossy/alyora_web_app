import mongoose from 'mongoose';
import { tenantScoped } from '../../../lib/tenancy/tenant-scope.plugin.js';

/**
 * Collection organizations : le locataire racine. Un couple a son organisation personnelle,
 * une agence la sienne ; chaque événement appartient à une organisation. Racine du
 * cloisonnement : filtrée par son _id. Suppression logique.
 */
const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'organizations',
    timestamps: true,
    autoIndex: false,
    autoCreate: false,
    strict: 'throw',
  },
);

organizationSchema.plugin(tenantScoped, { keys: ['_id'] });

export const Organization = mongoose.model('Organization', organizationSchema);
