import { EMAILED_TOKEN_PARAM, emailedTokenSchema } from '@alyora/shared';

/**
 * Jeton d'un lien envoyé par e-mail (`#jeton=...`), s'il a le bon format. Lecture pure : le
 * fragment n'est jamais envoyé au serveur ; clearEmailedToken l'efface ensuite de l'adresse.
 *
 * @param {Pick<Location, 'hash'>} [location]
 * @returns {string | null}
 */
export function readEmailedToken(location = window.location) {
  const token = new URLSearchParams(location.hash.slice(1)).get(EMAILED_TOKEN_PARAM);
  const parsed = emailedTokenSchema.safeParse(token);
  return parsed.success ? parsed.data : null;
}

/**
 * Efface le fragment de l'adresse : le jeton ne reste ni dans l'historique, ni dans une copie
 * de l'URL.
 *
 * @param {Location} [location]
 * @param {History} [history]
 */
export function clearEmailedToken(location = window.location, history = window.history) {
  if (location.hash) {
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  }
}
