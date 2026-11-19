import { QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy } from 'react';
import { useToastStore } from '../components/ui/toast-store.js';

/**
 * Affichage des notifications (primitive Radix Toast), chargé à la première notification
 * seulement : il n'alourdit pas le bundle initial.
 */
const Toaster = lazy(() =>
  import('../components/ui/Toast.jsx').then((module) => ({ default: module.Toaster })),
);

function DeferredToaster() {
  const active = useToastStore((state) => state.active);
  if (!active) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  );
}

/**
 * @typedef {object} AppProvidersProps
 * @property {import('@tanstack/react-query').QueryClient} queryClient
 * @property {import('react').ReactNode} children
 */

/**
 * Fournisseurs communs à toute l'application, et la zone des notifications. i18next n'a pas
 * besoin de fournisseur : il est branché sur React par initI18n().
 *
 * @param {AppProvidersProps} props
 */
export function AppProviders({ queryClient, children }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <DeferredToaster />
    </QueryClientProvider>
  );
}
