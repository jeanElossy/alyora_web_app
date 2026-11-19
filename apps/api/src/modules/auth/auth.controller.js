import { getAuth } from '../../lib/auth/require-auth.js';
import { createServiceContext } from '../../lib/context/service-context.js';
import { AppError, isAppError } from '../../lib/errors/app-error.js';
import {
  REFRESH_COOKIE,
  clearCookie,
  readCookie,
  refreshCookieOptions,
} from '../../lib/http/cookies.js';
import { getValidated } from '../../lib/http/validate.js';

/**
 * Controllers de /auth : lire l'entrée validée, construire le contexte, appeler le service,
 * poser ou effacer les cookies, répondre. Aucune logique métier ici.
 *
 * @param {object} deps
 * @param {import('./services/auth-services.js').AuthServices} deps.services
 * @param {import('../../lib/http/csrf.js').CsrfProtection} deps.csrf
 * @param {string | undefined} deps.cookieDomain
 * @param {import('pino').Logger} deps.logger
 */
export function createAuthController({ services, csrf, cookieDomain, logger }) {
  const refreshCookie = refreshCookieOptions(cookieDomain);

  /** @param {import('express').Request} req */
  const anonymous = (req) =>
    createServiceContext({ ip: req.ip ?? '', userAgent: req.get('User-Agent') ?? '' });

  /** @param {import('express').Request} req */
  const authenticated = (req) => {
    const { userId, sessionId } = getAuth(req);
    return createServiceContext({
      userId,
      authSessionId: sessionId,
      ip: req.ip ?? '',
      userAgent: req.get('User-Agent') ?? '',
    });
  };

  /**
   * Remet le refresh token (cookie HttpOnly) et l'access token (corps).
   *
   * @param {import('express').Response} res
   * @param {import('./services/session-tokens.js').IssuedTokens} tokens
   */
  const sendTokens = (res, { accessToken, refreshToken }) => {
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookie);
    res.status(200).json({ accessToken });
  };

  /** @param {import('express').Response} res */
  const accepted = (res) => res.status(202).json({ status: 'accepted' });

  /**
   * Répond « demande acceptée » tout de suite, puis fait le travail : aucune recherche ni
   * écriture n'a lieu avant la réponse, dont la durée ne dépend donc pas de l'existence du
   * compte. Un échec est journalisé (avec l'identifiant de corrélation), jamais renvoyé.
   *
   * @param {import('express').Response} res
   * @param {() => Promise<void>} work
   * @param {string} event
   */
  const acceptThenRun = async (res, work, event) => {
    accepted(res);
    try {
      await work();
    } catch (error) {
      logger.error({ err: error, event }, 'Deferred auth task failed');
    }
  };

  return {
    sendTokens,
    authenticated,
    anonymous,

    /** @type {import('express').RequestHandler} */
    csrfToken: (_req, res) => {
      res.status(200).json({ csrfToken: csrf.issue(res) });
    },

    /** @type {import('express').RequestHandler} */
    register: async (req, res) => {
      await services.registration.register(
        anonymous(req),
        /** @type {import('@alyora/shared/schemas').RegisterRequest} */ (getValidated(req, 'body')),
      );
      accepted(res);
    },

    /** @type {import('express').RequestHandler} */
    verifyEmail: async (req, res) => {
      await services.emailVerification.verify(
        anonymous(req),
        /** @type {import('@alyora/shared/schemas').VerifyEmailRequest} */ (
          getValidated(req, 'body')
        ),
      );
      res.status(200).json({ status: 'email_verified' });
    },

    /** @type {import('express').RequestHandler} */
    resendVerification: async (req, res) => {
      const context = anonymous(req);
      const input = /** @type {import('@alyora/shared/schemas').EmailRequest} */ (
        getValidated(req, 'body')
      );
      await acceptThenRun(
        res,
        () => services.emailVerification.resend(context, input),
        'resend_verification',
      );
    },

    /** @type {import('express').RequestHandler} */
    login: async (req, res) => {
      const result = await services.login.login(
        anonymous(req),
        /** @type {import('@alyora/shared/schemas').LoginRequest} */ (getValidated(req, 'body')),
      );
      if ('challengeToken' in result) {
        // 2FA active : pas encore de session, ni de cookie. Le code est attendu sur 2fa/verify.
        res
          .status(200)
          .json({ status: 'two_factor_required', challengeToken: result.challengeToken });
        return;
      }
      sendTokens(res, result);
    },

    /** @type {import('express').RequestHandler} */
    refresh: async (req, res) => {
      const presented = readCookie(req, REFRESH_COOKIE);
      try {
        if (!presented) {
          throw new AppError('UNAUTHENTICATED');
        }
        sendTokens(res, await services.sessions.rotate(anonymous(req), presented));
      } catch (error) {
        // Un refresh refusé efface le cookie : le client repart par la connexion.
        if (isAppError(error) && error.code === 'UNAUTHENTICATED') {
          clearCookie(res, REFRESH_COOKIE, refreshCookie);
        }
        throw error;
      }
    },

    /** @type {import('express').RequestHandler} */
    logout: async (req, res) => {
      await services.sessions.logout(authenticated(req));
      clearCookie(res, REFRESH_COOKIE, refreshCookie);
      res.status(204).end();
    },

    /** @type {import('express').RequestHandler} */
    logoutAll: async (req, res) => {
      await services.sessions.revokeAll(authenticated(req));
      clearCookie(res, REFRESH_COOKIE, refreshCookie);
      res.status(204).end();
    },

    /** @type {import('express').RequestHandler} */
    forgotPassword: async (req, res) => {
      const context = anonymous(req);
      const input = /** @type {import('@alyora/shared/schemas').EmailRequest} */ (
        getValidated(req, 'body')
      );
      await acceptThenRun(
        res,
        () => services.passwordReset.requestReset(context, input),
        'forgot_password',
      );
    },

    /** @type {import('express').RequestHandler} */
    resetPassword: async (req, res) => {
      await services.passwordReset.reset(
        anonymous(req),
        /** @type {import('@alyora/shared/schemas').ResetPasswordRequest} */ (
          getValidated(req, 'body')
        ),
      );
      res.status(200).json({ status: 'password_reset' });
    },

    /** @type {import('express').RequestHandler} */
    me: async (req, res) => {
      res.status(200).json(await services.profile.me(authenticated(req)));
    },

    /** @type {import('express').RequestHandler} */
    updateMe: async (req, res) => {
      res
        .status(200)
        .json(
          await services.profile.update(
            authenticated(req),
            /** @type {import('@alyora/shared/schemas').UpdateProfileRequest} */ (
              getValidated(req, 'body')
            ),
          ),
        );
    },

    /** @type {import('express').RequestHandler} */
    listSessions: async (req, res) => {
      res.status(200).json({ sessions: await services.sessions.list(authenticated(req)) });
    },

    /** @type {import('express').RequestHandler} */
    revokeSession: async (req, res) => {
      const context = authenticated(req);
      const { sessionId } = /** @type {{ sessionId: string }} */ (getValidated(req, 'params'));
      await services.sessions.revoke(context, sessionId);
      if (sessionId === context.authSessionId) {
        clearCookie(res, REFRESH_COOKIE, refreshCookie);
      }
      res.status(204).end();
    },
  };
}

/** @typedef {ReturnType<typeof createAuthController>} AuthController */
