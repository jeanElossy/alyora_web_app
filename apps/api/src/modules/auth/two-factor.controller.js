import { getValidated } from '../../lib/http/validate.js';

/**
 * Controllers de la double authentification et de la réauthentification. Aucune logique
 * métier ici.
 *
 * @param {object} deps
 * @param {import('./services/auth-services.js').AuthServices} deps.services
 * @param {import('./auth.controller.js').AuthController} deps.auth Contexte et remise des jetons,
 *   partagés avec les autres routes /auth.
 */
export function createTwoFactorController({ services, auth }) {
  return {
    /** @type {import('express').RequestHandler} */
    verify: async (req, res) => {
      auth.sendTokens(
        res,
        await services.twoFactorLogin.complete(
          auth.anonymous(req),
          /** @type {import('@alyora/shared/schemas').TwoFactorVerifyRequest} */ (
            getValidated(req, 'body')
          ),
        ),
      );
    },

    /** @type {import('express').RequestHandler} */
    setup: async (req, res) => {
      res.status(200).json(await services.twoFactor.setup(auth.authenticated(req)));
    },

    /** @type {import('express').RequestHandler} */
    enable: async (req, res) => {
      const backupCodes = await services.twoFactor.enable(
        auth.authenticated(req),
        /** @type {{ otp: string }} */ (getValidated(req, 'body')),
      );
      res.status(200).json({ backupCodes });
    },

    /** @type {import('express').RequestHandler} */
    disable: async (req, res) => {
      await services.twoFactor.disable(
        auth.authenticated(req),
        /** @type {import('@alyora/shared/schemas').TwoFactorDisableRequest} */ (
          getValidated(req, 'body')
        ),
      );
      res.status(204).end();
    },

    /** @type {import('express').RequestHandler} */
    reauthenticate: async (req, res) => {
      const accessToken = await services.reauthentication.reauthenticate(
        auth.authenticated(req),
        /** @type {import('@alyora/shared/schemas').ReauthenticateRequest} */ (
          getValidated(req, 'body')
        ),
      );
      res.status(200).json({ accessToken });
    },

    /** @type {import('express').RequestHandler} */
    changePassword: async (req, res) => {
      await services.reauthentication.changePassword(
        auth.authenticated(req),
        /** @type {import('@alyora/shared/schemas').ChangePasswordRequest} */ (
          getValidated(req, 'body')
        ),
      );
      res.status(204).end();
    },
  };
}
