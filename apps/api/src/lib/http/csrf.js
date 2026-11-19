import { CSRF_HEADER } from '@alyora/shared';
import { generateToken, safeEqual } from '../crypto/random-token.js';
import { AppError } from '../errors/app-error.js';
import { CSRF_COOKIE, csrfCookieOptions, readCookie } from './cookies.js';

/** Méthodes qui ne modifient rien : jamais soumises au contrôle. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protection CSRF par double soumission signée (recommandation OWASP) :
 * - GET /auth/csrf délivre un jeton « <aléa>.<HMAC(aléa)> », dans le corps de la réponse et
 *   dans un cookie HttpOnly ;
 * - toute requête qui modifie l'état renvoie le jeton dans l'en-tête X-CSRF-Token ; l'API
 *   vérifie qu'il est identique au cookie et que sa signature est la sienne.
 * Un autre site ne peut ni lire le jeton (CORS), ni poser l'en-tête (requête préalable CORS
 * refusée). La signature empêche un sous-domaine compromis d'imposer un cookie de son choix.
 * C'est une seconde ligne de défense, après SameSite=Lax et la liste blanche CORS.
 *
 * @param {object} deps
 * @param {import('../crypto/keyed-hash.js').KeyedHasher} deps.keyedHasher
 * @param {string | undefined} deps.cookieDomain
 */
export function createCsrfProtection({ keyedHasher, cookieDomain }) {
  /** @param {string} nonce */
  const sign = (nonce) => keyedHasher.digest('csrf', nonce);

  /** @param {string} token */
  function isAuthentic(token) {
    const [nonce, signature, ...rest] = token.split('.');
    return Boolean(nonce && signature && rest.length === 0 && safeEqual(signature, sign(nonce)));
  }

  return {
    /**
     * Délivre le jeton du navigateur : celui de son cookie s'il est authentique, sinon un
     * nouveau. Tous les onglets d'un navigateur partagent ainsi le même jeton : un onglet qui
     * en demande un n'invalide pas celui des autres.
     *
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @returns {string}
     */
    issue(req, res) {
      const existing = readCookie(req, CSRF_COOKIE);
      if (existing && isAuthentic(existing)) {
        return existing;
      }
      const nonce = generateToken();
      const token = `${nonce}.${sign(nonce)}`;
      res.cookie(CSRF_COOKIE, token, csrfCookieOptions(cookieDomain));
      return token;
    },

    /**
     * Middleware : refuse (CSRF_INVALID) une requête qui modifie l'état sans jeton valide.
     *
     * @returns {import('express').RequestHandler}
     */
    requireCsrf() {
      return (req, _res, next) => {
        if (SAFE_METHODS.has(req.method)) {
          next();
          return;
        }
        const header = req.get(CSRF_HEADER);
        const cookie = readCookie(req, CSRF_COOKIE);
        if (!header || !cookie || !safeEqual(header, cookie) || !isAuthentic(header)) {
          throw new AppError('CSRF_INVALID');
        }
        next();
      };
    },
  };
}

/** @typedef {ReturnType<typeof createCsrfProtection>} CsrfProtection */
