import mongoose from 'mongoose';
import { tenantScoped } from '../../../lib/tenancy/tenant-scope.plugin.js';
import { requireSingleRoleAssignment, roleAssignmentFields } from './role-assignment.fields.js';

export const COLLABORATOR_STATUSES = Object.freeze(/** @type {const} */ (['active', 'revoked']));

/**
 * Collection collaborators : l'accès d'un compte à un événement, et la seule source des
 * permissions sur cet événement (être membre de l'organisation n'en donne aucune). Un
 * collaborateur se révoque (status, revokedAt), jamais ne s'efface : c'est l'historique de
 * l'équipe.
 *
 * Cloisonnée par eventId, ou par organizationId pour retrouver les porteurs d'un rôle
 * personnalisé. Index (migration) :
 * - un seul collaborateur actif par (eventId, userId) ;
 * - un seul propriétaire actif par événement ;
 * - (eventId, status, _id) pour la liste paginée ;
 * - (organizationId, customRoleId) pour invalider les porteurs d'un rôle personnalisé.
 */
const collaboratorSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, required: true },
    /** Organisation de l'événement, recopiée : les rôles personnalisés en dépendent. */
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    ...roleAssignmentFields(),
    /** Compte qui a invité ; null pour le créateur de l'événement. */
    invitedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, enum: COLLABORATOR_STATUSES, default: 'active' },
    acceptedAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  {
    collection: 'collaborators',
    timestamps: true,
    autoIndex: false,
    autoCreate: false,
    strict: 'throw',
  },
);

collaboratorSchema.plugin(tenantScoped, { keys: ['eventId', 'organizationId'] });
requireSingleRoleAssignment(collaboratorSchema);

export const Collaborator = mongoose.model('Collaborator', collaboratorSchema);

/** @typedef {mongoose.InferSchemaType<typeof collaboratorSchema> & { _id: mongoose.Types.ObjectId }} CollaboratorRecord */
