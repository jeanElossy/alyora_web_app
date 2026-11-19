import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '../lib/api/api-error.js';

/**
 * Durée pendant laquelle une donnée reçue est considérée fraîche : aucun nouvel appel pour la
 * même clé pendant ce délai. Explicite, plutôt que le 0 par défaut de TanStack Query, qui
 * referait une requête à chaque montage de composant (coûteux sur un réseau mobile).
 */
export const DEFAULT_STALE_TIME_MS = 30_000;

/** Nombre maximal de nouvelles tentatives d'une requête qui a échoué pour une raison transitoire. */
export const MAX_QUERY_RETRIES = 2;

/**
 * Une erreur 4xx ne se corrige pas en réessayant (données invalides, accès refusé,
 * introuvable) : pas de nouvelle tentative. Les erreurs réseau (statut 0) et 5xx sont
 * réessayées, deux fois au plus.
 *
 * @param {number} failureCount Nombre d'échecs déjà subis.
 * @param {unknown} error
 * @returns {boolean}
 */
export function shouldRetry(failureCount, error) {
  if (isApiError(error) && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < MAX_QUERY_RETRIES;
}

/** @returns {QueryClient} */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: DEFAULT_STALE_TIME_MS, retry: shouldRetry },
      // Une écriture n'est jamais rejouée automatiquement : elle pourrait s'appliquer deux fois.
      mutations: { retry: false },
    },
  });
}
