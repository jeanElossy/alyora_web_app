import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSessionStore } from '../../../lib/session/session-store.js';
import { authApi } from '../auth-api.js';

/**
 * Bouton « Se déconnecter » de l'en-tête des espaces protégés. Il veille aussi sur la session :
 * si elle prend fin ailleurs (refresh refusé, déconnexion de tous les appareils), il ramène à
 * la connexion de l'espace, avec la page en cours comme retour.
 *
 * @param {{ loginPath: string, label: string, pendingLabel: string }} props Textes déjà
 *   traduits (le bouton vit dans le bundle de chaque espace).
 */
export function SignOutButton({ loginPath, label, pendingLabel }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const accessToken = useSessionStore((state) => state.accessToken);
  const hadSession = useRef(Boolean(accessToken));
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (accessToken) {
      hadSession.current = true;
      return;
    }
    if (hadSession.current) {
      hadSession.current = false;
      queryClient.clear();
      const retour = `${location.pathname}${location.search}`;
      void navigate(`${loginPath}?${new URLSearchParams({ retour })}`, { replace: true });
    }
  }, [accessToken, loginPath, location.pathname, location.search, navigate, queryClient]);

  const signOut = async () => {
    setPending(true);
    hadSession.current = false;
    try {
      await authApi.logout();
    } catch {
      // La session locale est effacée quoi qu'il arrive (voir authApi.logout).
    }
    queryClient.clear();
    void navigate(loginPath, { replace: true });
  };

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={pending}
      aria-busy={pending || undefined}
      className="rounded-full border border-charcoal/15 px-4 py-2 text-sm font-medium text-forest transition-colors hover:border-forest disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
