import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../app/queryKeys.js';
import { apiClient } from '../../lib/api/api-client.js';

/** Appelle GET /api/v1/ping par TanStack Query et le client API (jamais fetch directement). */
export function useApiPing() {
  return useQuery({
    queryKey: queryKeys.system.ping(),
    queryFn: ({ signal }) => apiClient.request('/ping', { signal }),
  });
}
