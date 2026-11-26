import { createCollaboratorService } from './collaborator.service.js';
import { createInvitationAcceptanceService } from './invitation-acceptance.service.js';
import { createInvitationService } from './invitation.service.js';
import { createOwnershipService } from './ownership.service.js';

/**
 * Tous les services de l'équipe d'un événement, avec leurs dépendances. Aucun ne lit req ni
 * res : chacun reçoit un contexte explicite (ServiceContext) et se teste sans Express.
 *
 * @param {import('./invitation.service.js').InvitationServiceDeps} deps
 */
export function createAccessServices(deps) {
  return {
    collaborators: createCollaboratorService(deps),
    invitations: createInvitationService(deps),
    acceptance: createInvitationAcceptanceService(deps),
    ownership: createOwnershipService(deps),
  };
}

/** @typedef {ReturnType<typeof createAccessServices>} AccessServices */
