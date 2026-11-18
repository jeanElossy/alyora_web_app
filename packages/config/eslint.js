import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

/** Rules applied to every JavaScript file of the monorepo. */
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
    // Logging goes through Pino only.
    'no-console': 'error',
    // Files longer than 300 lines must be split.
    'max-lines': ['error', { max: 300 }],
    eqeqeq: ['error', 'always'],
    'no-var': 'error',
    'prefer-const': 'error',
  },
});

/** Node.js runtime: api, worker, shared and tooling files. */
export const node = defineConfig({
  name: 'alyora/node',
  languageOptions: {
    globals: globals.node,
  },
});

/** Browser runtime with React: apps/web sources. */
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

/** Must come last: turns off stylistic rules that conflict with Prettier. */
export const prettier = defineConfig(prettierConfig);
