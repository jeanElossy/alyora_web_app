import { getAuth } from '../../lib/auth/require-auth.js';
import { eventServiceContext } from '../../lib/context/event-context.js';
import { createServiceContext } from '../../lib/context/service-context.js';
import { getValidated } from '../../lib/http/validate.js';

/**
 * Controllers de l'équipe d'un événement : lire l'entrée validée, construire le contexte,
 * appeler le service, répondre. Aucune logique métier ici, et aucun accès à un modèle.
 *
 * @param {{ services: import('./services/access-services.js').AccessServices }} deps
 */
export function createCollaborationController({ services }) {
  /** @param {import('express').Request} req */
  const params = (req) =>
    /** @type {{ eventId: string, collaboratorId: string, invitationId: string }} */ (
      getValidated(req, 'params')
    );
  /** @param {import('express').Request} req */
  const query = (req) =>
    /** @type {import('@alyora/shared').CursorPageQuery} */ (getValidated(req, 'query'));

  /**
   * Contexte de l'invité qui accepte : il n'est pas encore collaborateur, l'événement vient
   * donc de l'adresse, et aucune permission n'est résolue.
   *
   * @param {import('express').Request} req
   */
  const inviteeContext = (req) => {
    const { userId, sessionId } = getAuth(req);
    return createServiceContext({
      userId,
      authSessionId: sessionId,
      eventId: params(req).eventId,
      ip: req.ip ?? '',
      userAgent: req.get('User-Agent') ?? '',
    });
  };

  return {
    /** @type {import('express').RequestHandler} */
    listCollaborators: async (req, res) => {
      res.status(200).json(await services.collaborators.list(eventServiceContext(req), query(req)));
    },

    /** @type {import('express').RequestHandler} */
    updateCollaborator: async (req, res) => {
      const body = /** @type {{ role: import('@alyora/shared').RoleAssignment }} */ (
        getValidated(req, 'body')
      );
      res
        .status(200)
        .json(
          await services.collaborators.update(
            eventServiceContext(req),
            params(req).collaboratorId,
            body,
          ),
        );
    },

    /** @type {import('express').RequestHandler} */
    revokeCollaborator: async (req, res) => {
      await services.collaborators.revoke(eventServiceContext(req), params(req).collaboratorId);
      res.status(204).end();
    },

    /** @type {import('express').RequestHandler} */
    transferOwnership: async (req, res) => {
      const body = /** @type {{ collaboratorId: string }} */ (getValidated(req, 'body'));
      res.status(200).json(await services.ownership.transfer(eventServiceContext(req), body));
    },

    /** @type {import('express').RequestHandler} */
    listInvitations: async (req, res) => {
      res.status(200).json(await services.invitations.list(eventServiceContext(req), query(req)));
    },

    /** @type {import('express').RequestHandler} */
    createInvitation: async (req, res) => {
      const body = /** @type {import('@alyora/shared').CreateInvitationRequest} */ (
        getValidated(req, 'body')
      );
      res.status(201).json(await services.invitations.create(eventServiceContext(req), body));
    },

    /** @type {import('express').RequestHandler} */
    revokeInvitation: async (req, res) => {
      await services.invitations.revoke(eventServiceContext(req), params(req).invitationId);
      res.status(204).end();
    },

    /** @type {import('express').RequestHandler} */
    acceptInvitation: async (req, res) => {
      const body = /** @type {{ token: string }} */ (getValidated(req, 'body'));
      res.status(201).json(await services.acceptance.accept(inviteeContext(req), body));
    },
  };
}

/** @typedef {ReturnType<typeof createCollaborationController>} CollaborationController */
