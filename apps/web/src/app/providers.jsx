import { QueryClientProvider } from '@tanstack/react-query';

/**
 * @typedef {object} AppProvidersProps
 * @property {import('@tanstack/react-query').QueryClient} queryClient
 * @property {import('react').ReactNode} children
 */

/**
 * Fournisseurs communs à toute l'application. i18next n'a pas besoin de fournisseur : il est
 * branché sur React par initI18n().
 *
 * @param {AppProvidersProps} props
 */
export function AppProviders({ queryClient, children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
