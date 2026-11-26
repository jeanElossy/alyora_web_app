import { getEventAccess } from '../../lib/auth/require-permission.js';

/**
 * Controllers du module des autorisations : lire l'accès résolu par les gardes, répondre.
 * Aucune logique métier ici, et aucun accès à un modèle.
 */
export function createAccessController() {
  return {
    /** @type {import('express').RequestHandler} */
    myPermissions: (req, res) => {
      const { eventId, role, permissions } = getEventAccess(req);
      res.status(200).json({ eventId, role, permissions });
    },
  };
}

/** @typedef {ReturnType<typeof createAccessController>} AccessController */
