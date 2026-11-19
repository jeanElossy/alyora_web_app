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
  { files: ['**/*.js'], ignores: ['apps/web/src/**', 'apps/web/e2e/**'], extends: [node] },
  { files: ['apps/web/src/**/*.{js,jsx}'], extends: [react] },
  { files: ['apps/web/src/lib/api/**/*.js'], extends: [reactApiClient] },
  { files: ['apps/web/src/**/*.test.{js,jsx}'], extends: [reactTests] },
  { files: ['apps/web/e2e/**/*.js'], extends: [e2e] },
  prettier,
]);
