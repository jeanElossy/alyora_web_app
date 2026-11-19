import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../app/queryKeys.js';
import { authApi } from './auth-api.js';

/** Le compte connecté (GET /auth/me). */
export function useCurrentUser() {
  return useQuery({ queryKey: queryKeys.auth.me(), queryFn: () => authApi.me() });
}

/** Les sessions actives du compte (GET /auth/sessions). */
export function useAuthSessions() {
  return useQuery({ queryKey: queryKeys.auth.sessions(), queryFn: () => authApi.sessions() });
}

/**
 * Mutation qui, réussie, invalide les données du compte : profil et sessions se rechargent.
 *
 * @template TVariables, TResult
 * @param {(variables: TVariables) => Promise<TResult>} mutationFn
 */
export function useAccountMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.auth.all }),
  });
}
