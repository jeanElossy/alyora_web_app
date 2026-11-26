import { usePermissions } from './use-permissions.js';

// RAPPEL : <Can> masque une partie de l'interface quand l'utilisateur n'a pas la permission.
// C'est un confort d'affichage, JAMAIS une sécurité : ce qui est masqué ici reste accessible à
// qui modifie la page ou appelle l'API directement. L'API vérifie chaque permission, sur chaque
// requête, et c'est elle seule qui protège les données.

/**
 * Affiche `children` seulement si le compte connecté détient `permission` sur l'événement.
 * Rien pendant le chargement des permissions ; `fallback` si la permission manque ou si les
 * permissions n'ont pas pu être lues.
 *
 * @param {object} props
 * @param {string | null | undefined} props.eventId
 * @param {import('@alyora/shared').Permission} props.permission
 * @param {import('react').ReactNode} [props.fallback]
 * @param {import('react').ReactNode} [props.children]
 */
export function Can({ eventId, permission, fallback = null, children }) {
  const { can, isLoading, isError } = usePermissions(eventId);
  if (isLoading) {
    return null;
  }
  return <>{!isError && can(permission) ? children : fallback}</>;
}
