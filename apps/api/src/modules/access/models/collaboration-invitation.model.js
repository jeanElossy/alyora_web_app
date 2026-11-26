import mongoose from 'mongoose';
import { tenantScoped } from '../../../lib/tenancy/tenant-scope.plugin.js';
import { requireSingleRoleAssignment, roleAssignmentFields } from './role-assignment.fields.js';

export const INVITATION_STATUSES = Object.freeze(
  /** @type {const} */ (['pending', 'accepted', 'revoked']),
);

/**
 * Collection collaboration_invitations : une invitation à rejoindre l'équipe d'un événement.
 * Le jeton (128 bits d'aléa) n'est jamais stocké, seulement son empreinte ; il est envoyé par
 * e-mail, avec l'événement, si bien que l'invitation se cherche toujours par (eventId,
 * tokenHash). Une invitation se révoque, jamais ne s'efface.
 *
 * Cloisonnée par eventId. Index (migration) : (eventId, tokenHash) unique, une seule
 * invitation en attente par (eventId, email), (eventId, status, _id) pour la liste paginée.
 */
const invitationSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    /** Normalisée (minuscules, sans espaces) par emailSchema de @alyora/shared. */
    email: { type: String, required: true },
    ...roleAssignmentFields(),
    invitedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    /** Empreinte SHA-256 du jeton. Jamais lue sauf demande explicite. */
    tokenHash: { type: String, required: true, select: false },
    status: { type: String, enum: INVITATION_STATUSES, default: 'pending' },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  {
    collection: 'collaboration_invitations',
    timestamps: true,
    autoIndex: false,
    autoCreate: false,
    strict: 'throw',
  },
);

invitationSchema.plugin(tenantScoped, { keys: ['eventId'] });
requireSingleRoleAssignment(invitationSchema);

export const CollaborationInvitation = mongoose.model('CollaborationInvitation', invitationSchema);
