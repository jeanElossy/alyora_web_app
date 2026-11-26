import { z } from 'zod';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../constants/access.js';
import { objectIdSchema } from './access.schema.js';

/**
 * Requête d'une liste paginée par curseur : `cursor` est l'identifiant du dernier élément de
 * la page précédente, `limit` la taille de la page. Jamais de skip : une liste qui grossit
 * reste aussi rapide à parcourir.
 */
export const cursorPageQuerySchema = z.strictObject({
  cursor: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});

/**
 * Réponse d'une liste paginée : les éléments, et le curseur de la page suivante (null s'il
 * n'y en a pas).
 *
 * @template {z.ZodType} T
 * @param {T} item
 */
export function cursorPageSchema(item) {
  return z.strictObject({ items: z.array(item), nextCursor: objectIdSchema.nullable() });
}

/** @typedef {z.infer<typeof cursorPageQuerySchema>} CursorPageQuery */
