/** Base de l'API quand VITE_API_BASE_URL est absente : la même origine que l'application. */
export const DEFAULT_API_BASE_URL = '/api/v1';

/**
 * Valide VITE_API_BASE_URL : une URL http(s) absolue ou un chemin absolu, sans barre finale.
 * Absente, l'API est cherchée sur la même origine (/api/v1).
 *
 * @param {string | undefined} value
 * @returns {string}
 * @throws {Error} Au démarrage, si la valeur est invalide.
 */
export function resolveApiBaseUrl(value) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_API_BASE_URL;
  }
  const isPath = trimmed.startsWith('/') && !trimmed.startsWith('//');
  const isHttpUrl = /^https?:\/\/[^/\s]+(\/\S*)?$/.test(trimmed);
  if ((!isPath && !isHttpUrl) || trimmed.endsWith('/')) {
    throw new Error(
      'VITE_API_BASE_URL must be an http(s) URL or an absolute path, without trailing slash',
    );
  }
  return trimmed;
}
