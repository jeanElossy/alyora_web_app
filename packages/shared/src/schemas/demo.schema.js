import { z } from 'zod';

/**
 * Schéma de DÉMONSTRATION du formulaire de la page /design-system (client web, hors
 * production). Aucune valeur métier : il illustre le branchement de React Hook Form sur un
 * schéma partagé. À supprimer avec la page, et à ne jamais réutiliser pour un vrai RSVP.
 */
export const designSystemDemoFormSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.email(),
  attendance: z.enum(['yes', 'no']),
  guests: z.coerce.number().int().min(1).max(10),
  menu: z.enum(['classic', 'vegetarian', 'fish']),
  message: z.string().trim().max(280).optional(),
  consent: z.literal(true),
});

/** @typedef {z.infer<typeof designSystemDemoFormSchema>} DesignSystemDemoForm */
