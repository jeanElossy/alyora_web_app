import { base, node, prettier, react } from '@alyora/config/eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['**/dist/', '**/coverage/']),
  base,
  { files: ['**/*.js'], ignores: ['apps/web/src/**'], extends: [node] },
  { files: ['apps/web/src/**/*.{js,jsx}'], extends: [react] },
  prettier,
]);
