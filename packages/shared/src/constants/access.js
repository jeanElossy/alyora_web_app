// Constantes des autorisations, partagées par l'API et le client web.

/**
 * Durée de vie, dans le cache Redis, des permissions résolues d'un utilisateur sur un
 * événement : 60 secondes. Le cache est invalidé à chaque changement de rôle ou révocation ;
 * cette durée ne borne que le cas où l'invalidation échoue (Redis injoignable). Le client web
 * garde ses permissions aussi longtemps avant de les redemander.
 */
export const PERMISSION_CACHE_TTL_SECONDS = 60;
