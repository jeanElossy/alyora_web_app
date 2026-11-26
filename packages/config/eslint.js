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

const ROLE_COMPARISON_MESSAGE =
  'Comparaison à une clé de rôle interdite : passer par une permission, ou par les fonctions de packages/shared/src/permissions/roles.js (isOwnerRole...).';
/** Clés des rôles prédéfinis (packages/shared/src/permissions/roles.js). */
const ROLE_KEY = '/^(owner|admin|editor|reader|checkin_agent)$/';

/**
 * Toute décision qui dépend d'un rôle passe par roles.js : une comparaison à une clé de rôle
 * écrite en dur, dispersée dans le code, est refusée (===, !==, ==, !=, case).
 */
const ROLE_COMPARISON_SELECTORS = [
  {
    selector: `BinaryExpression[operator=/^[!=]==?$/] > Literal[value=${ROLE_KEY}]`,
    message: ROLE_COMPARISON_MESSAGE,
  },
  { selector: `SwitchCase > Literal.test[value=${ROLE_KEY}]`, message: ROLE_COMPARISON_MESSAGE },
];

/** Sources Node (api, worker, shared) : pas de comparaison à une clé de rôle. */
export const roleComparisons = defineConfig({
  name: 'alyora/role-comparisons',
  rules: {
    'no-restricted-syntax': ['error', ...ROLE_COMPARISON_SELECTORS],
  },
});

/** Controllers de l'API : ils passent par un service, jamais par un modèle. */
export const apiControllers = defineConfig({
  name: 'alyora/api-controllers',
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/*.model.js', '**/models/*', 'mongoose'],
            message: 'Un controller passe par un service : jamais d’accès direct à un modèle.',
          },
        ],
      },
    ],
  },
});

const NO_FETCH_MESSAGE = 'Passer par le client API (src/lib/api), jamais par fetch directement.';
const NO_LITERAL_TEXT_MESSAGE = 'Texte en dur interdit : passer par i18next (t()).';
/** Une lettre, accents compris : un texte d'interface, pas un séparateur ni un nombre. */
const LETTER = '/[A-Za-zÀ-ÖØ-öø-ÿ]/';
/** Attributs dont la valeur est lue ou affichée à l'utilisateur. */
const TEXT_ATTRIBUTES =
  '/^(aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext|alt|label|placeholder|title)$/';

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
  rules: {
    'no-restricted-globals': ['error', { name: 'fetch', message: NO_FETCH_MESSAGE }],
    'no-restricted-properties': [
      'error',
      { object: 'window', property: 'fetch', message: NO_FETCH_MESSAGE },
      { object: 'globalThis', property: 'fetch', message: NO_FETCH_MESSAGE },
    ],
    'no-restricted-syntax': [
      'error',
      ...ROLE_COMPARISON_SELECTORS,
      { selector: `JSXText[value=${LETTER}]`, message: NO_LITERAL_TEXT_MESSAGE },
      {
        selector: `:matches(JSXElement, JSXFragment) > JSXExpressionContainer > Literal[value=${LETTER}]`,
        message: NO_LITERAL_TEXT_MESSAGE,
      },
      {
        selector: `:matches(JSXElement, JSXFragment) > JSXExpressionContainer > TemplateLiteral`,
        message: NO_LITERAL_TEXT_MESSAGE,
      },
      {
        selector: `JSXAttribute[name.name=${TEXT_ATTRIBUTES}] > Literal[value=${LETTER}]`,
        message: NO_LITERAL_TEXT_MESSAGE,
      },
      {
        selector: `JSXAttribute[name.name=${TEXT_ATTRIBUTES}] > JSXExpressionContainer > Literal[value=${LETTER}]`,
        message: NO_LITERAL_TEXT_MESSAGE,
      },
    ],
  },
});

/** Le client API est le seul code du web autorisé à appeler fetch. */
export const reactApiClient = defineConfig({
  name: 'alyora/react-api-client',
  rules: {
    'no-restricted-globals': 'off',
    'no-restricted-properties': 'off',
  },
});

/**
 * Tests de bout en bout (Playwright) : Node, plus le code passé à page.evaluate(), exécuté
 * dans le navigateur.
 */
export const e2e = defineConfig({
  name: 'alyora/e2e',
  languageOptions: {
    globals: { ...globals.node, ...globals.browser },
  },
});

/** Tests du web : ils peuvent écrire du texte en dur (données de test, doublures). */
export const reactTests = defineConfig({
  name: 'alyora/react-tests',
  rules: {
    'no-restricted-syntax': 'off',
    'no-restricted-globals': 'off',
  },
});

/** Doit venir en dernier : désactive les règles de style qui entrent en conflit avec Prettier. */
export const prettier = defineConfig(prettierConfig);
