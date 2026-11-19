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

| Commande                                   | Effet                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `pnpm lint`                                | ESLint, vérification Prettier et vérification JSDoc (`tsc`).                            |
| `pnpm format`                              | Reformate tout le dépôt avec Prettier.                                                  |
| `pnpm test`                                | Lance les tests Vitest de tous les paquets (API : couverture de `src/lib`, seuil 80 %). |
| `pnpm -r build`                            | Build de tous les paquets qui en ont un (aujourd'hui : web).                            |
| `pnpm --filter @alyora/api dev`            | Démarre l'API en mode watch.                                                            |
| `pnpm --filter @alyora/worker dev`         | Démarre le worker en mode watch.                                                        |
| `pnpm --filter @alyora/web dev`            | Démarre le serveur de développement Vite.                                               |
| `pnpm --filter @alyora/api migrate:status` | État des migrations MongoDB (`migrate:up`, `migrate:down`, `migrate:create <nom>`).     |

Chaque paquet expose aussi ses propres scripts (`dev`, `start`, `test`, `typecheck`, `build`),
utilisables avec `pnpm --filter <paquet> <script>`.

Les tests de l'API démarrent un replica set MongoDB en mémoire (mongodb-memory-server). Le
premier `pnpm test` télécharge le binaire MongoDB (environ 120 Mo) dans
`~/.cache/mongodb-binaries`. Ils démarrent aussi un vrai Redis dans un conteneur Docker
jetable (image `redis:8`), supprimé à la fin. Ils n'ont donc besoin ni de MongoDB ni de Redis
installés, mais **Docker est requis**. Pour utiliser un Redis existant à la place, définir
`REDIS_TEST_URL` (les tests y écrivent des clés `rl:test-*`, qui expirent en une minute). Un arrêt brutal des tests peut laisser un
conteneur : `docker rm -f $(docker ps -q --filter label=alyora-test=redis)` le supprime.

## API

| Route              | Rôle                                                                  |
| ------------------ | --------------------------------------------------------------------- |
| `GET /health`      | Le processus est vivant. Ne vérifie rien d'autre.                     |
| `GET /ready`       | MongoDB et Redis répondent (200), sinon 503. Statut seulement.        |
| `GET /api/v1/ping` | Le routeur v1 répond.                                                 |
| `GET /api/v1/docs` | Document OpenAPI 3.1, généré depuis les schémas Zod. Hors production. |

Toute erreur suit le format `{ code, message, details }`, avec un code du catalogue de
`packages/shared`. Chaque réponse porte un en-tête `X-Request-Id`, repris dans tous les logs
de la requête. Les décisions du socle de l'API sont dans
[docs/decisions/0002-api-foundation.md](./docs/decisions/0002-api-foundation.md).

Démarrer l'API en local demande MongoDB **en replica set** (l'API refuse un serveur
standalone, car les transactions y sont impossibles) et Redis. Par exemple avec Docker :

```sh
docker run -d --name alyora-mongo -p 27017:27017 mongo:8 --replSet rs0
docker exec alyora-mongo mongosh --quiet --eval "rs.initiate()"
docker run -d --name alyora-redis -p 6379:6379 redis:8
```

puis, dans `apps/api/.env` : `NODE_ENV=development`,
`MONGODB_URI=mongodb://localhost:27017/alyora?replicaSet=rs0&directConnection=true` et
`REDIS_URL=redis://localhost:6379`.

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
réelle et ne doit jamais en contenir. Les fichiers `.env` sont ignorés par git. L'API valide
ses variables avec Zod au démarrage et refuse de démarrer si l'une manque ou est invalide.
Le détail (format, valeurs par défaut) est dans chaque `.env.example`.

### apps/api

Statut : **obligatoire** partout ; **prod** : obligatoire en production, valeur par défaut
annoncée au démarrage en développement et en test ; **à venir** : lue par un module futur.

| Variable                | Statut      | Rôle                                                |
| ----------------------- | ----------- | --------------------------------------------------- |
| `NODE_ENV`              | obligatoire | `development`, `test` ou `production`.              |
| `PORT`                  | prod        | Port HTTP de l'API.                                 |
| `LOG_LEVEL`             | prod        | Niveau de log Pino.                                 |
| `MONGODB_URI`           | obligatoire | Chaîne de connexion MongoDB (replica set).          |
| `MONGODB_MAX_POOL_SIZE` | prod        | Taille maximale du pool de connexions par instance. |
| `REDIS_URL`             | obligatoire | Connexion Redis (files BullMQ, rate limiting).      |
| `CORS_ORIGINS`          | prod        | Origines navigateur autorisées (liste blanche).     |
| `TRUST_PROXY`           | prod        | Nombre de proxys devant l'API, ou `false`.          |
| `ACCESS_TOKEN_SECRET`   | à venir     | Secret de signature des access tokens.              |
| `ACCESS_TOKEN_TTL`      | à venir     | Durée de vie d'un access token.                     |
| `REFRESH_TOKEN_TTL`     | à venir     | Durée de vie d'un refresh token.                    |
| `COOKIE_DOMAIN`         | à venir     | Domaine du cookie de refresh token.                 |
| `WEB_APP_URL`           | à venir     | URL publique de l'application web (liens envoyés).  |

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
