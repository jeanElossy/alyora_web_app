import { Outlet, ScrollRestoration } from 'react-router';
import { NavigationProgress } from './RouteLoading.jsx';

/** Route racine : commune aux quatre espaces, sans mise en page propre. */
export function RootLayout() {
  return (
    <>
      <NavigationProgress />
      <Outlet />
      <ScrollRestoration />
    </>
  );
}
