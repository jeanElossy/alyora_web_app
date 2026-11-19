/**
 * Page où revenir après la connexion (paramètre `retour`), si elle est sûre : un chemin de
 * l'application elle-même. Tout le reste (autre site, « //autre.site », « /\autre.site »,
 * « javascript: », caractères de contrôle) est refusé : la connexion ne doit pas servir de
 * redirection ouverte vers un site de hameçonnage.
 *
 * @param {string | null} value
 * @param {string} fallback Accueil de l'espace.
 * @param {string} [origin] Origine de l'application (window.location.origin).
 * @returns {string}
 */
export function safeReturnPath(value, fallback, origin = globalThis.location?.origin) {
  if (!value || !origin || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }
  // eslint-disable-next-line no-control-regex -- refuse justement les caractères de contrôle.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
