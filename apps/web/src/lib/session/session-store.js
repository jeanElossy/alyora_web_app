import { create } from 'zustand';

/**
 * @typedef {object} SessionState
 * @property {string | null} accessToken Access token court, gardé en mémoire seulement :
 *   jamais dans localStorage ni dans un cookie lisible. Un rechargement de page le perd ; la
 *   session est alors rétablie par un refresh silencieux (cookie HttpOnly).
 * @property {(accessToken: string) => void} setAccessToken
 * @property {() => void} clear
 */

/** État client de la session (Zustand). L'état serveur, lui, passe par TanStack Query. */
export const useSessionStore = create(
  /** @returns {SessionState} */
  (set) => ({
    accessToken: null,
    setAccessToken: (accessToken) => set({ accessToken }),
    clear: () => set({ accessToken: null }),
  }),
);
