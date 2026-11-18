import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

/** Règles appliquées à tous les fichiers JavaScript du monorepo. */
export const base = defineConfig({
  name: 'alyora/base',
  files: ['**/*.{js,jsx}'],
  extends: [js.configs.recommended],
  linterOptions: {
    reportUnusedDisableDirectives: 'error',
  },
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    // Les logs passent uniquement par Pino.
    'no-console': 'error',
    // Un fichier de plus de 300 lignes doit être découpé.
    'max-lines': ['error', { max: 300 }],
    eqeqeq: ['error', 'always'],
    'no-var': 'error',
    'prefer-const': 'error',
  },
});

/** Environnement Node.js : api, worker, shared et fichiers d'outillage. */
export const node = defineConfig({
  name: 'alyora/node',
  languageOptions: {
    globals: globals.node,
  },
});

/** Environnement navigateur avec React : sources de apps/web. */
export const react = defineConfig({
  name: 'alyora/react',
  extends: [reactHooks.configs.flat.recommended],
  languageOptions: {
    globals: globals.browser,
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

/** Doit venir en dernier : désactive les règles de style qui entrent en conflit avec Prettier. */
export const prettier = defineConfig(prettierConfig);
