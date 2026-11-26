/**
 * Catalogue plat de toutes les permissions, nommées `module:action`. C'est la seule source de
 * vérité : l'API les applique, le client web s'en sert seulement pour adapter l'affichage.
 *
 * Ajouter, renommer ou retirer une permission est une décision revue (ADR 0006) : un rôle
 * personnalisé ou une liste explicite qui en contient une inconnue la perd simplement à la
 * résolution, sans erreur.
 *
 * L'ordre est celui de l'affichage : regroupé par module, de la lecture vers les actions les
 * plus sensibles.
 */
export const PERMISSIONS = Object.freeze(
  /** @type {const} */ ([
    // L'événement lui-même : nom, date, lieu. Tout collaborateur l'a.
    'event:read',
    // Invités et leurs réponses.
    'guests:read',
    'guests:write',
    // Notes internes sur les invités : chaque lecture est journalisée (audit_logs).
    'notes:read',
    'notes:write',
    'rsvp:manage',
    // Plan de table. Publier le rend visible des invités ; un plan validé n'est jamais modifié
    // par un changement de RSVP (règle métier 1).
    'seating:read',
    'seating:write',
    'seating:publish',
    // Programme. Un changement important exige l'approbation avant toute notification
    // (règle métier 7).
    'program:read',
    'program:write',
    'program:approve',
    // Messages aux invités.
    'messages:read',
    'messages:send',
    // Albums et médias. Un album public ne rend pas ses médias publics (règle métier 3).
    'albums:read',
    'albums:manage',
    // Argent : contributions des invités et reversements (séparés des abonnements).
    'contributions:read',
    'contributions:manage',
    'payouts:manage',
    // Exports. Chaque export est journalisé (audit_logs).
    'exports:guests',
    'exports:financial',
    // Équipe de l'événement.
    'collaborators:read',
    'collaborators:invite',
    'collaborators:manage',
    'settings:manage',
    'audit:read',
    // Accueil le jour J : une liste réduite (nom, table, statut), sans les coordonnées.
    'checkin:read',
    'checkin:scan',
  ]),
);

/** @typedef {(typeof PERMISSIONS)[number]} Permission */

/**
 * Permissions qui donnent accès à des données financières. Aucun rôle d'accueil ni de lecture
 * ne doit en détenir (testé) ; les tests d'accès des lots financiers s'appuient sur cette
 * liste.
 */
export const FINANCIAL_PERMISSIONS = Object.freeze(
  /** @type {ReadonlyArray<Permission>} */ ([
    'contributions:read',
    'contributions:manage',
    'payouts:manage',
    'exports:financial',
  ]),
);

const KNOWN = new Set(/** @type {ReadonlyArray<string>} */ (PERMISSIONS));

/**
 * @param {unknown} value
 * @returns {value is Permission}
 */
export function isPermission(value) {
  return typeof value === 'string' && KNOWN.has(value);
}

/**
 * Rang d'une permission dans le catalogue : les listes renvoyées par l'API suivent cet ordre.
 *
 * @param {Permission} permission
 * @returns {number}
 */
export function permissionRank(permission) {
  return PERMISSIONS.indexOf(permission);
}
