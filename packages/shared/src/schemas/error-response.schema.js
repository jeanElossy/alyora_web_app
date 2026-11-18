import { z } from 'zod';
import { ERROR_CODES } from '../errors/index.js';

/**
 * Un champ invalide. `path` est l'emplacement, segments joints par des points
 * ("guests.0.email", "" pour la racine). La valeur reçue n'est jamais renvoyée.
 */
export const errorIssueSchema = z.strictObject({
  path: z.string(),
  code: z.string().min(1),
  message: z.string().min(1),
});

/**
 * Contexte de l'erreur, lisible par une machine. Strict volontairement : rien d'autre (pile
 * d'appels, état interne) ne peut parvenir au client par `details`.
 */
export const errorDetailsSchema = z.strictObject({
  issues: z.array(errorIssueSchema).optional(),
});

/**
 * Format normalisé des erreurs de l'API : { code, message, details }.
 */
export const errorResponseSchema = z.strictObject({
  code: z.enum(ERROR_CODES),
  message: z.string().min(1),
  details: errorDetailsSchema.optional(),
});

/** @typedef {z.infer<typeof errorIssueSchema>} ErrorIssue */
/** @typedef {z.infer<typeof errorDetailsSchema>} ErrorDetails */
/** @typedef {z.infer<typeof errorResponseSchema>} ErrorResponse */
