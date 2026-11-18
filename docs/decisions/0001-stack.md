# 0001 — Stack technique et organisation du dépôt

- **Statut** : acceptée
- **Date** : 2026-11-18
- **Module** : M0.1 (initialisation du monorepo)

## Contexte

ALYORA est une plateforme SaaS de gestion d'événements, avec les mariages en premier,
pour le marché ivoirien (interface en français, montants en XOF). Le projet réunit une
API, des traitements différés et une application web. Les schémas de validation et les
codes d'erreur doivent être partagés entre le front et le back.

## Décision

### Runtime et outillage

- **Node 26 LTS**, fixé par `.nvmrc` et `engines`.
- **pnpm 12 en workspaces**, seul gestionnaire de paquets. Node 26 n'embarque plus
  Corepack : pnpm s'installe avec son script officiel.
- **JavaScript ESM**, sans TypeScript. La sûreté de typage passe par JSDoc et `checkJs`.
  Le paquet `typescript` sert uniquement de vérificateur (`tsc --noEmit`) : aucun
  fichier `.ts` dans le dépôt.

### Backend

- Express 5, Mongoose 9, MongoDB Atlas en replica set (nécessaire aux transactions).
- BullMQ et Redis pour tout traitement long ou différé.
- argon2id pour les mots de passe.
- Pino comme seul logger (`no-console` est une erreur ESLint).

### Frontend

- React 19, Vite 7, React Router 7, TanStack Query 5, Zustand 5, Tailwind 4.
- **Vite 7 et non Vite 8**, conformément aux règles du projet. Le plugin
  `@vitejs/plugin-react` reste donc en 5.x, car la 6.x exige Vite 8.

### Partagé

- Zod 4 côté serveur et côté client. Les schémas vivent dans `packages/shared`.

### Tests

- Vitest, Supertest, mongodb-memory-server, Playwright.

### Organisation du dépôt

```text
apps/api      API HTTP
apps/worker   traitements différés, importe le code de l'API via le workspace
apps/web      application React
packages/shared  schémas, constantes, codes d'erreur, permissions
packages/config  ESLint, Prettier, jsconfig de base
```

- `apps/api` a deux points d'entrée. `src/index.js` est une bibliothèque sans effet de
  bord, importée par le worker. `src/server.js` démarre le processus. Importer l'API
  depuis le worker ne lance donc jamais de serveur.
- `.editorconfig` est à la racine : EditorConfig se cherche en remontant depuis chaque
  fichier, donc placé dans `packages/config` il ne s'appliquerait qu'à ce dossier. Le
  jsconfig de base est partagé, et chaque paquet a son `jsconfig.json` qui l'étend.

### Qualité et CI

- ESLint en flat config. Règles notables : `no-console` et `max-lines` à 300 lignes.
  Prettier, husky, lint-staged, commitlint (Conventional Commits).
- CI GitHub Actions sur chaque pull request, avec cinq jobs parallèles : lint, tests,
  build, audit, scan de secrets.
- Actions tierces épinglées par SHA de commit.
- `pnpm audit --audit-level=high` : une faille mineure dans une dépendance externe ne
  bloque pas toutes les pull requests.
- gitleaks est exécuté depuis son binaire officiel, en version fixe avec checksum
  vérifié. Ce choix évite `gitleaks-action`, qui exige une licence pour les dépôts
  d'organisation.

### Politique d'installation pnpm

- `engineStrict: true` : l'installation échoue avec une mauvaise version de Node ou de pnpm.
- `allowBuilds` : seuls les paquets listés peuvent exécuter un script d'installation.
  Aujourd'hui, seul esbuild, utilisé par Vite, est autorisé.
- pnpm refuse par défaut les versions publiées très récemment. Cette protection est
  conservée, sans aucune exception.
- `punycode` est exclu du hoisting caché de pnpm. ESLint l'installe, et une fois hoisté,
  il masque le module intégré `punycode` typé par `@types/node`. Sans cette exclusion,
  `tsc` vérifie sa source JavaScript et échoue.

## Conséquences

- Aucune étape de build pour l'API, le worker et `shared` : Node exécute directement les
  sources ESM, et Vite consomme `shared` depuis ses sources.
- Toute nouvelle bibliothèque doit être validée avant d'être ajoutée.
- Passer à Vite 8 imposera de mettre à jour les règles du projet et
  `@vitejs/plugin-react`.
