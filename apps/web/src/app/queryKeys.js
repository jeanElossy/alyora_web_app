/**
 * Clés de requête TanStack Query, toutes déclarées ici : jamais de tableau écrit à la main
 * dans un composant. Chaque domaine expose `all` (pour invalider tout le domaine) et des
 * fabriques pour ses requêtes, de la plus large à la plus précise, si bien qu'invalider une
 * clé invalide aussi celles qui la prolongent.
 *
 * Exemple à venir : guests: { all: ['guests'], list: (eventId, filters) =>
 * ['guests', 'list', eventId, filters] }.
 */
export const queryKeys = Object.freeze({
  system: Object.freeze({
    all: /** @type {const} */ (['system']),
    ping: () => /** @type {const} */ (['system', 'ping']),
  }),
  // Le compte connecté : invalidé à la connexion et à la déconnexion.
  auth: Object.freeze({
    all: /** @type {const} */ (['auth']),
    me: () => /** @type {const} */ (['auth', 'me']),
    sessions: () => /** @type {const} */ (['auth', 'sessions']),
  }),
});
