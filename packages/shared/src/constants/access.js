// Constantes des autorisations, partagées par l'API et le client web.

/**
 * Durée de vie, dans le cache Redis, des permissions résolues d'un utilisateur sur un
 * événement : 60 secondes. Le cache est invalidé à chaque changement de rôle ou révocation ;
 * cette durée ne borne que le cas où l'invalidation échoue (Redis injoignable). Le client web
 * garde ses permissions aussi longtemps avant de les redemander.
 */
export const PERMISSION_CACHE_TTL_SECONDS = 60;

/** Durée de validité d'une invitation à rejoindre l'équipe d'un événement : 7 jours. */
export const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Page de l'application web vers laquelle pointe l'e-mail d'invitation. L'événement et le
 * jeton voyagent dans le fragment (`#evenement=...&jeton=...`) : un navigateur ne l'envoie
 * jamais au serveur, il n'apparaît ni dans les logs ni dans l'en-tête Referer.
 */
export const ACCESS_WEB_PATHS = Object.freeze({
  acceptInvitation: '/invitation',
});

/** Nom du paramètre du fragment qui porte l'événement d'une invitation. */
export const INVITATION_EVENT_PARAM = 'evenement';

/** Taille d'une page de liste, par défaut et au plus (pagination par curseur). */
export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 100;
