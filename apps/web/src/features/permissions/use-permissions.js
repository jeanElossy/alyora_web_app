import { PERMISSION_CACHE_TTL_SECONDS, hasPermission, isPermission } from '@alyora/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '../../app/queryKeys.js';
import { permissionsApi } from './permissions-api.js';

// RAPPEL : ce hook sert à adapter l'affichage (masquer un bouton qui échouerait). Ce n'est
// JAMAIS une sécurité : le navigateur est entre les mains de l'utilisateur, qui peut modifier
// ce code ou appeler l'API directement. Chaque requête est vérifiée par l'API
// (requirePermission), qui seule décide d'un accès.

/** @typedef {import('@alyora/shared').Permission} Permission */

const NO_PERMISSION = Object.freeze(/** @type {Permission[]} */ ([]));

/**
 * Permissions du compte connecté sur un événement, gardées aussi longtemps que le cache de
 * l'API (60 secondes) avant d'être redemandées. Tant qu'elles ne sont pas connues, ou si la
 * requête échoue (404 pour un événement étranger), `can()` répond non.
 *
 * @param {string | null | undefined} eventId
 */
export function usePermissions(eventId) {
  const query = useQuery({
    queryKey: queryKeys.permissions.mine(eventId ?? ''),
    queryFn: ({ signal }) => permissionsApi.mine(/** @type {string} */ (eventId), signal),
    staleTime: PERMISSION_CACHE_TTL_SECONDS * 1000,
    enabled: Boolean(eventId),
  });
  const permissions = query.data?.permissions ?? NO_PERMISSION;

  const can = useCallback(
    /**
     * @param {Permission} permission Une permission du catalogue : une faute de frappe lève
     *   une erreur au lieu de masquer l'interface en silence.
     * @returns {boolean}
     */
    (permission) => {
      if (!isPermission(permission)) {
        throw new TypeError(`usePermissions(): unknown permission "${String(permission)}"`);
      }
      return hasPermission(permissions, permission);
    },
    [permissions],
  );

  return {
    can,
    permissions,
    role: query.data?.role ?? null,
    isLoading: query.isPending && Boolean(eventId),
    isError: query.isError,
  };
}
