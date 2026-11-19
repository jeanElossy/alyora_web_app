import {
  base,
  e2e,
  node,
  prettier,
  react,
  reactApiClient,
  reactTests,
} from '@alyora/config/eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['**/dist/', '**/coverage/', '**/playwright-report/', '**/test-results/']),
  base,
  {
    files: ['**/*.js'],
    ignores: ['apps/web/src/**', 'apps/web/e2e/**', 'apps/web/test/**'],
    extends: [node],
  },
  { files: ['apps/web/src/**/*.{js,jsx}'], extends: [react] },
  { files: ['apps/web/src/lib/api/**/*.js'], extends: [reactApiClient] },
  { files: ['apps/web/src/**/*.test.{js,jsx}'], extends: [reactTests] },
  // Tests de bout en bout et setup des tests du web : Node, plus les API du navigateur (jsdom).
  { files: ['apps/web/e2e/**/*.js', 'apps/web/test/**/*.js'], extends: [e2e] },
  prettier,
]);
