import { z } from 'zod';

/** Réponse de GET /api/v1/ping. */
export const pingResponseSchema = z.strictObject({
  status: z.literal('ok'),
});

/** @typedef {z.infer<typeof pingResponseSchema>} PingResponse */
