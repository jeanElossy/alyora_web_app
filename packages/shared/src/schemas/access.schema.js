import { z } from 'zod';
import { PERMISSIONS } from '../permissions/catalog.js';
import { ROLE_KEYS } from '../permissions/roles.js';

/**
 * Identifiant MongoDB (ObjectId) tel qu'il voyage dans une URL ou un corps : 24 caractères
 * hexadécimaux en minuscules. Refuse tout objet, si bien qu'un opérateur Mongo ({ "$ne": … })
 * ne peut jamais atteindre une requête.
 */
export const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/);

/** Paramètres de toute route /events/:eventId/... */
export const eventIdParamsSchema = z.strictObject({ eventId: objectIdSchema });

export const permissionSchema = z.enum(PERMISSIONS);

export const roleKeySchema = z.enum(ROLE_KEYS);

/**
 * Rôle d'un collaborateur sur un événement : un rôle prédéfini, un rôle personnalisé de
 * l'organisation, ou une liste explicite de permissions.
 */
export const eventRoleSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('predefined'), key: roleKeySchema }),
  z.strictObject({ type: z.literal('custom'), customRoleId: objectIdSchema }),
  z.strictObject({ type: z.literal('explicit') }),
]);

/**
 * Réponse de GET /events/:eventId/permissions/me : ce que l'appelant peut faire sur
 * l'événement. Le client web s'en sert pour masquer ce qui ne servirait à rien ; l'API vérifie
 * de toute façon chaque permission, sur chaque requête.
 */
export const myPermissionsResponseSchema = z.strictObject({
  eventId: objectIdSchema,
  role: eventRoleSchema,
  permissions: z.array(permissionSchema),
});

/** @typedef {z.infer<typeof eventRoleSchema>} EventRole */
/** @typedef {z.infer<typeof myPermissionsResponseSchema>} MyPermissionsResponse */
