import { useCallback, useRef, useState } from 'react';
import { isApiError } from '../../lib/api/api-error.js';

/**
 * Exécute une opération sensible (2FA, mot de passe). Si l'API demande une authentification
 * récente (REAUTHENTICATION_REQUIRED), la fenêtre de confirmation s'ouvre ; une fois le mot de
 * passe confirmé, l'opération est rejouée, une seule fois. Fermée sans confirmer, l'opération
 * échoue avec l'erreur d'origine.
 *
 * @returns {{
 *   run: <T>(operation: () => Promise<T>) => Promise<T>,
 *   reauthOpen: boolean,
 *   onReauthenticated: () => void,
 *   onReauthCancelled: () => void,
 * }}
 */
export function useSensitiveAction() {
  const [reauthOpen, setReauthOpen] = useState(false);
  /** @type {import('react').RefObject<{ resolve: () => void, reject: () => void } | null>} */
  const pending = useRef(null);

  const run = useCallback(
    /**
     * @template T
     * @param {() => Promise<T>} operation
     * @returns {Promise<T>}
     */
    async (operation) => {
      try {
        return await operation();
      } catch (error) {
        if (!isApiError(error) || error.code !== 'REAUTHENTICATION_REQUIRED') {
          throw error;
        }
        await new Promise((resolve, reject) => {
          pending.current = { resolve: () => resolve(undefined), reject: () => reject(error) };
          setReauthOpen(true);
        });
        return operation();
      }
    },
    [],
  );

  const onReauthenticated = useCallback(() => {
    setReauthOpen(false);
    pending.current?.resolve();
    pending.current = null;
  }, []);

  const onReauthCancelled = useCallback(() => {
    setReauthOpen(false);
    pending.current?.reject();
    pending.current = null;
  }, []);

  return { run, reauthOpen, onReauthenticated, onReauthCancelled };
}
