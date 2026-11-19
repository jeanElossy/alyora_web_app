import { REFRESH_TOKEN_TTL_SECONDS } from '@alyora/shared';
import { parseCookie } from 'cookie';

/**
 * Noms des cookies. Le préfixe __Secure- oblige le navigateur à refuser un cookie de ce nom
 * qui ne serait pas Secure : un réseau hostile ne peut pas en poser un en HTTP.
 */
export const REFRESH_COOKIE = '__Secure-alyora_rt';
export const CSRF_COOKIE = '__Secure-alyora_csrf';

/** Seule route qui reçoit le refresh token : il ne voyage avec aucune autre requête. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth/refresh';

/** Le cookie CSRF accompagne toutes les requêtes de l'API, qui le comparent à l'en-tête. */
export const CSRF_COOKIE_PATH = '/api/v1';

/**
 * Attributs communs : jamais lisibles par JavaScript (HttpOnly), jamais envoyés en clair
 * (Secure), pas envoyés par une requête d'un autre site qui modifie l'état (SameSite=Lax).
 *
 * @param {string | undefined} domain
 * @returns {import('express').CookieOptions}
 */
function baseOptions(domain) {
  return { httpOnly: true, secure: true, sameSite: 'lax', ...(domain ? { domain } : {}) };
}

/**
 * @param {string | undefined} domain COOKIE_DOMAIN.
 * @returns {import('express').CookieOptions}
 */
export function refreshCookieOptions(domain) {
  return {
    ...baseOptions(domain),
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
    priority: 'high',
  };
}

/**
 * Cookie de session (sans Max-Age) : le jeton CSRF vit jusqu'à la fermeture du navigateur.
 *
 * @param {string | undefined} domain
 * @returns {import('express').CookieOptions}
 */
export function csrfCookieOptions(domain) {
  return { ...baseOptions(domain), path: CSRF_COOKIE_PATH };
}

/**
 * Valeur d'un cookie de la requête.
 *
 * @param {import('express').Request} req
 * @param {string} name
 * @returns {string | undefined}
 */
export function readCookie(req, name) {
  const header = req.get('Cookie');
  if (!header) {
    return undefined;
  }
  try {
    return parseCookie(header)[name];
  } catch {
    return undefined;
  }
}

/**
 * Efface un cookie : mêmes attributs (chemin, domaine), date passée.
 *
 * @param {import('express').Response} res
 * @param {string} name
 * @param {import('express').CookieOptions} options
 */
export function clearCookie(res, name, options) {
  // Express refuse maxAge dans clearCookie : il calcule lui-même une date passée.
  const attributes = { ...options };
  delete attributes.maxAge;
  res.clearCookie(name, attributes);
}
