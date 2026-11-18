import { z } from 'zod';
import { ERROR_CODES } from '../errors/index.js';

/**
 * Normalized API error payload: { code, message, details }.
 * `details` is optional and carries machine-readable context (e.g. invalid fields).
 */
export const errorResponseSchema = z.strictObject({
  code: z.enum(ERROR_CODES),
  message: z.string().min(1),
  details: z.unknown().optional(),
});

/** @typedef {z.infer<typeof errorResponseSchema>} ErrorResponse */
