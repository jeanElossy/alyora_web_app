import { z } from 'zod';
import { PERMISSIONS } from '../permissions/catalog.js';
import {
  eventIdParamsSchema,
  eventRoleSchema,
  objectIdSchema,
  permissionSchema,
  roleKeySchema,
} from './access.schema.js';
import { emailSchema } from './auth-fields.schema.js';
import { cursorPageSchema } from './pagination.schema.js';

/**
 * Rôle demandé pour un collaborateur ou une invitation : un rôle prédéfini, un rôle
 * personnalisé de l'organisation, ou une liste explicite de permissions. Le schéma accepte le
 * rôle de propriétaire pour que le refus vienne de la règle d'escalade (403), avec son code :
 * ce rôle ne s'accorde que par un transfert de propriété.
 */
export const roleAssignmentSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('predefined'), key: roleKeySchema }),
  z.strictObject({ type: z.literal('custom'), customRoleId: objectIdSchema }),
  z.strictObject({
    type: z.literal('explicit'),
    permissions: z.array(permissionSchema).min(1).max(PERMISSIONS.length),
  }),
]);

/** Jeton d'une invitation : 128 bits d'aléa, en base64url (22 caractères). */
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

export const collaboratorParamsSchema = eventIdParamsSchema.extend({
  collaboratorId: objectIdSchema,
});

export const invitationParamsSchema = eventIdParamsSchema.extend({
  invitationId: objectIdSchema,
});

/** Corps de POST /events/:eventId/invitations */
export const createInvitationRequestSchema = z.strictObject({
  email: emailSchema,
  role: roleAssignmentSchema,
});

/** Corps de POST /events/:eventId/invitations/accept */
export const acceptInvitationRequestSchema = z.strictObject({
  token: invitationTokenSchema,
});

/** Corps de PATCH /events/:eventId/collaborators/:collaboratorId */
export const updateCollaboratorRequestSchema = z.strictObject({
  role: roleAssignmentSchema,
});

/** Corps de POST /events/:eventId/ownership-transfer : le collaborateur qui devient propriétaire. */
export const ownershipTransferRequestSchema = z.strictObject({
  collaboratorId: objectIdSchema,
});

/**
 * Réponse du transfert de propriété. Un corps (et non 204) : l'idempotence rejoue cette
 * réponse à une nouvelle tentative, au lieu de réexécuter un transfert déjà fait.
 */
export const ownershipTransferResponseSchema = z.strictObject({
  ownerCollaboratorId: objectIdSchema,
  formerOwnerCollaboratorId: objectIdSchema,
});

/** Un membre de l'équipe d'un événement. Pas d'adresse e-mail : seulement son nom. */
export const collaboratorSchema = z.strictObject({
  id: objectIdSchema,
  userId: objectIdSchema,
  firstName: z.string(),
  lastName: z.string(),
  role: eventRoleSchema,
  permissions: z.array(permissionSchema),
  invitedBy: objectIdSchema.nullable(),
  acceptedAt: z.iso.datetime(),
});

/** Une invitation en attente. « expired » : en attente, mais sa date de validité est passée. */
export const invitationSchema = z.strictObject({
  id: objectIdSchema,
  email: z.string(),
  role: eventRoleSchema,
  permissions: z.array(permissionSchema),
  invitedBy: objectIdSchema,
  status: z.enum(['pending', 'expired']),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export const collaboratorListResponseSchema = cursorPageSchema(collaboratorSchema);
export const invitationListResponseSchema = cursorPageSchema(invitationSchema);

/** @typedef {z.infer<typeof roleAssignmentSchema>} RoleAssignment */
/** @typedef {z.infer<typeof collaboratorSchema>} Collaborator */
/** @typedef {z.infer<typeof invitationSchema>} Invitation */
/** @typedef {z.infer<typeof createInvitationRequestSchema>} CreateInvitationRequest */
