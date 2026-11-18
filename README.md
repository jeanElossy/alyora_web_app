# ALYORA

Plateforme SaaS de gestion d'événements (mariages d'abord), pour le marché ivoirien.
Interface en français, montants en XOF.

Les règles du projet (architecture, sécurité, règles métier, conventions) sont dans
[CLAUDE.md](./CLAUDE.md). Les décisions d'architecture sont tracées dans
[docs/decisions/](./docs/decisions/).

## Prérequis

| Outil | Version | Remarque                                                      |
| ----- | ------- | ------------------------------------------------------------- |
| Node  | 26 LTS  | Version fixée dans `.nvmrc` (`nvm use` à la racine).          |
| pnpm  | 12      | Seul gestionnaire de paquets autorisé.                        |
| Git   | récent  | Nécessaire aux hooks husky (lint et commitlint avant commit). |

L'installation refuse une version de Node ou de pnpm hors des plages déclarées
(`engineStrict`).

Installation de pnpm avec le script officiel (Node 26 n'embarque plus Corepack) :

```sh
curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=12 sh -
```

Autres méthodes : <https://pnpm.io/installation>.

## Installation

```sh
nvm use
pnpm install
```

`pnpm install` installe aussi les hooks git (husky).

Copier ensuite les modèles de variables d'environnement :

```sh
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env.local
```

## Commandes

À lancer depuis la racine du dépôt.

| Commande                           | Effet                                                        |
| ---------------------------------- | ------------------------------------------------------------ |
| `pnpm lint`                        | ESLint, vérification Prettier et vérification JSDoc (`tsc`). |
| `pnpm format`                      | Reformate tout le dépôt avec Prettier.                       |
| `pnpm test`                        | Lance les tests Vitest de tous les paquets.                  |
| `pnpm -r build`                    | Build de tous les paquets qui en ont un (aujourd'hui : web). |
| `pnpm --filter @alyora/api dev`    | Démarre l'API en mode watch.                                 |
| `pnpm --filter @alyora/worker dev` | Démarre le worker en mode watch.                             |
| `pnpm --filter @alyora/web dev`    | Démarre le serveur de développement Vite.                    |

Chaque paquet expose aussi ses propres scripts (`dev`, `start`, `test`, `typecheck`, `build`),
utilisables avec `pnpm --filter <paquet> <script>`.

## Structure

```text
apps/
  api/        API HTTP (Express). src/index.js : point d'entrée bibliothèque, sans effet
              de bord, consommé par le worker. src/server.js : point d'entrée du processus.
  worker/     Traitements longs et différés (BullMQ). Importe le code de l'API via le
              workspace, sans rien dupliquer.
  web/        Application React (Vite).
packages/
  shared/     Code partagé front et back : schemas/ (Zod), constants/, errors/, permissions/.
  config/     Configuration partagée : ESLint (flat config), Prettier, jsconfig de base.
docs/
  decisions/  Décisions d'architecture (ADR).
```

Les paquets s'importent par leur nom (`@alyora/shared`, `@alyora/api`) grâce aux
workspaces pnpm.

## Variables d'environnement

Chaque application a un fichier `.env.example` commenté. Il ne contient aucune valeur
réelle et ne doit jamais en contenir. Les fichiers `.env` sont ignorés par git, et toutes
les variables seront validées par Zod au démarrage.

### apps/api

| Variable              | Rôle                                               |
| --------------------- | -------------------------------------------------- |
| `NODE_ENV`            | `development`, `test` ou `production`.             |
| `PORT`                | Port HTTP de l'API.                                |
| `LOG_LEVEL`           | Niveau de log Pino.                                |
| `MONGODB_URI`         | Chaîne de connexion MongoDB Atlas (replica set).   |
| `REDIS_URL`           | Connexion Redis (files BullMQ, rate limiting).     |
| `ACCESS_TOKEN_SECRET` | Secret de signature des access tokens.             |
| `ACCESS_TOKEN_TTL`    | Durée de vie d'un access token.                    |
| `REFRESH_TOKEN_TTL`   | Durée de vie d'un refresh token.                   |
| `CORS_ORIGINS`        | Origines navigateur autorisées.                    |
| `COOKIE_DOMAIN`       | Domaine du cookie de refresh token.                |
| `WEB_APP_URL`         | URL publique de l'application web (liens envoyés). |

### apps/worker

| Variable             | Rôle                                          |
| -------------------- | --------------------------------------------- |
| `NODE_ENV`           | `development`, `test` ou `production`.        |
| `LOG_LEVEL`          | Niveau de log Pino.                           |
| `MONGODB_URI`        | Même base que l'API.                          |
| `REDIS_URL`          | Même instance Redis que l'API.                |
| `WORKER_CONCURRENCY` | Nombre de jobs traités en parallèle par file. |

### apps/web

| Variable            | Rôle                                             |
| ------------------- | ------------------------------------------------ |
| `VITE_API_BASE_URL` | URL de base de l'API, préfixe `/api/v1` compris. |

Toute variable `VITE_*` se retrouve dans le JavaScript public : aucun secret côté web.

## Conventions

- **Commits** : [Conventional Commits](https://www.conventionalcommits.org/), vérifiés
  par commitlint au moment du commit (`feat: …`, `fix: …`, `chore: …`).
- **Pre-commit** : lint-staged lance ESLint et Prettier sur les fichiers indexés.
- **Code** : JavaScript ESM uniquement, vérifié par JSDoc (`checkJs`).

## Intégration continue

`.github/workflows/ci.yml` s'exécute sur chaque pull request. Cinq jobs tournent en parallèle :

1. lint, format et typecheck ;
2. tests ;
3. build ;
4. `pnpm audit` (échoue sur les vulnérabilités hautes et critiques) ;
5. scan de secrets avec gitleaks (version fixée, checksum vérifié, historique complet).
