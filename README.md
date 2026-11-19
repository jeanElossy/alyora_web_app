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

| Commande                                   | Effet                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                | ESLint, vérification Prettier et vérification JSDoc (`tsc`).                                               |
| `pnpm format`                              | Reformate tout le dépôt avec Prettier.                                                                     |
| `pnpm test`                                | Lance les tests Vitest de tous les paquets (API : couverture de `src/lib` et des `services/`, seuil 80 %). |
| `pnpm -r build`                            | Build de tous les paquets qui en ont un (aujourd'hui : web, avec le rapport de budget).                    |
| `pnpm --filter @alyora/api dev`            | Démarre l'API en mode watch.                                                                               |
| `pnpm --filter @alyora/worker dev`         | Démarre le worker en mode watch.                                                                           |
| `pnpm --filter @alyora/web dev`            | Démarre le serveur de développement Vite.                                                                  |
| `pnpm --filter @alyora/web test:e2e`       | Tests de bout en bout Playwright, en 360 px, sur le build de production.                                   |
| `pnpm --filter @alyora/api migrate:status` | État des migrations MongoDB (`migrate:up`, `migrate:down`, `migrate:create <nom>`).                        |

Chaque paquet expose aussi ses propres scripts (`dev`, `start`, `test`, `typecheck`, `build`),
utilisables avec `pnpm --filter <paquet> <script>`.

Les tests de l'API démarrent un replica set MongoDB en mémoire (mongodb-memory-server). Le
premier `pnpm test` télécharge le binaire MongoDB (environ 120 Mo) dans
`~/.cache/mongodb-binaries`. Ils démarrent aussi un vrai Redis dans un conteneur Docker
jetable (image `redis:8`), supprimé à la fin. Ils n'ont donc besoin ni de MongoDB ni de Redis
installés, mais **Docker est requis**. Pour utiliser un Redis existant à la place, définir
`REDIS_TEST_URL` (les tests y écrivent des clés `rl:test-*`, qui expirent en une minute). Un arrêt brutal des tests peut laisser un
conteneur : `docker rm -f $(docker ps -q --filter label=alyora-test=redis)` le supprime.

Les tests de bout en bout du web demandent Chromium pour Playwright, à installer une fois :
`pnpm --filter @alyora/web exec playwright install chromium`. Ils construisent l'application,
la servent avec `vite preview` et simulent les réponses de l'API.

## Application web

Quatre espaces, chacun dans son propre bundle, chargé à la première visite :

| Chemin          | Espace                          | Accès                                    |
| --------------- | ------------------------------- | ---------------------------------------- |
| `/`             | Public (et invités)             | Libre                                    |
| `/organisateur` | Organisateur et collaborateurs  | Session, sinon `/organisateur/connexion` |
| `/accueil`      | Accueil des invités le jour J   | Session, sinon `/accueil/connexion`      |
| `/admin`        | Administration de la plateforme | Session, sinon `/admin/connexion`        |

Pages du compte : `/inscription`, `/verifier-email`, `/mot-de-passe-oublie` et
`/reinitialiser-mot-de-passe` (adresses des liens d'e-mail) ; dans chaque espace protégé,
`/<espace>/connexion`, `/<espace>/profil` et `/<espace>/securite`. Elles forment un seul bundle
(`auth-pages`), chargé à la demande.

`pnpm --filter @alyora/web build` affiche le poids de chaque espace et échoue si le bundle
initial de l'espace public dépasse 180 Ko compressés.

Le design system (`src/components/ui/`) se consulte sur `/design-system` : tous les composants
dans tous leurs états, avec un passage en langue des clés de traduction. La page existe en
développement (`pnpm --filter @alyora/web dev`) et n'est jamais dans le build de production,
sauf avec `VITE_ENABLE_DESIGN_SYSTEM=true` (tests de bout en bout). Les décisions du socle web sont dans
[docs/decisions/0003-web-foundation.md](./docs/decisions/0003-web-foundation.md).

## API

| Route              | Rôle                                                                  |
| ------------------ | --------------------------------------------------------------------- |
| `GET /health`      | Le processus est vivant. Ne vérifie rien d'autre.                     |
| `GET /ready`       | MongoDB et Redis répondent (200), sinon 503. Statut seulement.        |
| `GET /api/v1/ping` | Le routeur v1 répond.                                                 |
| `GET /api/v1/docs` | Document OpenAPI 3.1, généré depuis les schémas Zod. Hors production. |

Authentification (`/api/v1/auth`) : `csrf`, `register`, `verify-email`, `resend-verification`,
`login`, `refresh`, `logout`, `logout-all`, `forgot-password`, `reset-password`, `me` (lecture et
modification), `sessions` (liste), `sessions/:sessionId` (révocation), `2fa/setup`, `2fa/enable`,
`2fa/disable`, `2fa/verify` (seconde étape de la connexion), `reauthenticate` et `password`. Toute route qui modifie
l'état exige l'en-tête `X-CSRF-Token` (jeton de `GET /api/v1/auth/csrf`) ; l'inscription exige
aussi `Idempotency-Key`. Les décisions (jetons, sessions, limites, verrouillage) sont dans
[docs/decisions/0004-auth.md](./docs/decisions/0004-auth.md).

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
`MONGODB_URI=mongodb://localhost:27017/alyora?replicaSet=rs0&directConnection=true`,
`REDIS_URL=redis://localhost:6379`, et les trois secrets `ACCESS_TOKEN_SECRET`, `HASH_SECRET` et
`DATA_ENCRYPTION_KEY`, chacun généré par `openssl rand -base64 32` (trois valeurs différentes ;
aucun n'a de valeur par défaut). Appliquer ensuite les migrations
(`pnpm --filter @alyora/api migrate:up`).

Les e-mails (vérification d'adresse, réinitialisation, alertes) passent par une file BullMQ,
chiffrés : lancer aussi le worker (`pnpm --filter @alyora/worker dev`, avec dans
`apps/worker/.env` les mêmes `REDIS_URL` et `DATA_ENCRYPTION_KEY`). En développement, il les
écrit en JSON dans `apps/worker/.mail-outbox/` (ignoré par git) : le lien de vérification s'y
trouve. En production, il les envoie par Brevo (voir l'ADR 0005).

## Structure

```text
apps/
  api/        API HTTP (Express). src/index.js : point d'entrée bibliothèque, sans effet
              de bord, consommé par le worker. src/server.js : point d'entrée du processus.
  worker/     Traitements longs et différés (BullMQ). Importe le code de l'API via le
              workspace, sans rien dupliquer.
  web/        Application React (Vite). src/app/ : routeur, fournisseurs, pages d'erreur ;
              src/spaces/ : un dossier par espace ; src/lib/ : client API, session, i18n ;
              src/components/ui/ : design system.
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
| `ACCESS_TOKEN_SECRET`   | obligatoire | Secret de signature des access tokens (HS256).      |
| `HASH_SECRET`           | obligatoire | Secret maître des empreintes à clé (IP, CSRF...).   |
| `DATA_ENCRYPTION_KEY`   | obligatoire | Clé AES-256-GCM (secret 2FA, e-mails en file).      |
| `WEB_APP_URL`           | prod        | Origine de l'application web (liens des e-mails).   |
| `COOKIE_DOMAIN`         | facultatif  | Domaine parent des cookies (refresh token, CSRF).   |

Les durées de vie des jetons (access token 15 minutes, refresh token 30 jours) sont des règles
du projet, fixées dans `packages/shared`, et non des réglages.

### apps/worker

| Variable              | Rôle                                                                          |
| --------------------- | ----------------------------------------------------------------------------- |
| `NODE_ENV`            | `development`, `test` ou `production`.                                        |
| `LOG_LEVEL`           | Niveau de log Pino.                                                           |
| `REDIS_URL`           | Même instance Redis que l'API.                                                |
| `WORKER_CONCURRENCY`  | Nombre de jobs traités en parallèle par file.                                 |
| `DATA_ENCRYPTION_KEY` | La même que l'API : déchiffre les e-mails de la file.                         |
| `EMAIL_TRANSPORT`     | `brevo` (seul accepté en production) ou `file` (développement).               |
| `MAIL_OUTBOX_DIR`     | Dossier des e-mails du transport `file`.                                      |
| `BREVO_API_KEY`       | Clé de l'API Brevo (`xkeysib-…`), jamais une clé SMTP. Transport `brevo`.     |
| `MAIL_FROM_EMAIL`     | Adresse d'expéditeur, d'un domaine authentifié chez Brevo. Transport `brevo`. |
| `MAIL_FROM_NAME`      | Nom d'expéditeur. Par défaut : `ALYORA`.                                      |
| `MONGODB_URI`         | À venir : même base que l'API.                                                |

### apps/web

| Variable                    | Rôle                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`         | URL de base de l'API, préfixe `/api/v1` compris. Vide : même origine (`/api/v1`).         |
| `VITE_ENABLE_DESIGN_SYSTEM` | `true` pour inclure la page `/design-system` dans un build (tests). Jamais en production. |

Toute variable `VITE_*` se retrouve dans le JavaScript public : aucun secret côté web.

## Déploiement

Pour l'instant, trois services, tous déployés depuis `main` :

- **Web sur Vercel** (https://alyora-web.vercel.app), dossier racine `apps/web`,
  `VITE_API_BASE_URL` vide. `apps/web/vercel.json` :
  - transmet `/api/*` à l'API sur Render. Le navigateur ne parle qu'à une seule origine, donc
    il accepte et renvoie les cookies de refresh et CSRF (`SameSite=Lax`). Sur deux domaines
    `vercel.app` et `onrender.com`, il les refuserait.
  - sert `index.html` à toute adresse qui n'est pas un fichier du build : liens directs et
    liens des e-mails (`/verifier-email`…).
- **API sur Render** (https://alyora-api.onrender.com) :

  | Réglage            | Valeur                                         |
  | ------------------ | ---------------------------------------------- |
  | Build Command      | `pnpm install --frozen-lockfile`               |
  | Start Command      | `pnpm --filter @alyora/api start`              |
  | Pre-Deploy Command | `pnpm --filter @alyora/api migrate:up`         |
  | Health Check Path  | `/health`                                      |
  | `TRUST_PROXY`      | `2` : le proxy de Vercel, puis celui de Render |
  | `CORS_ORIGINS`     | `https://alyora-web.vercel.app`                |
  | `WEB_APP_URL`      | `https://alyora-web.vercel.app`                |
  | `COOKIE_DOMAIN`    | absent : cookies limités au site Vercel        |

- **Worker sur Render** (Background Worker, même région que l'API et Redis) :

  | Réglage               | Valeur                                                |
  | --------------------- | ----------------------------------------------------- |
  | Build Command         | `pnpm install --frozen-lockfile`                      |
  | Start Command         | `pnpm --filter @alyora/worker start`                  |
  | `REDIS_URL`           | la même que l'API                                     |
  | `DATA_ENCRYPTION_KEY` | la même que l'API                                     |
  | `EMAIL_TRANSPORT`     | `brevo`                                               |
  | `MAIL_FROM_EMAIL`     | `no-reply@alyora.com`, domaine authentifié chez Brevo |

  avec aussi `NODE_ENV=production`, `LOG_LEVEL=info`, `WORKER_CONCURRENCY=5` et
  `BREVO_API_KEY`.

**Limite connue** : l'API reste joignable directement sur `onrender.com`. En l'appelant sans
passer par Vercel, un client peut choisir l'IP que voient les limites par IP (le verrouillage
des comptes, lui, tient). À terme, il faudra un domaine propre (`app.` et `api.`, avec
`COOKIE_DOMAIN`), un navigateur qui appelle `api.` directement, et `TRUST_PROXY=1`.

## Conventions

- **Commits** : [Conventional Commits](https://www.conventionalcommits.org/), vérifiés
  par commitlint au moment du commit (`feat: …`, `fix: …`, `chore: …`).
- **Pre-commit** : lint-staged lance ESLint et Prettier sur les fichiers indexés.
- **Code** : JavaScript ESM uniquement, vérifié par JSDoc (`checkJs`).

## Intégration continue

`.github/workflows/ci.yml` s'exécute sur chaque pull request. Six jobs tournent en parallèle :

1. lint, format et typecheck ;
2. tests ;
3. build (avec le budget du bundle public) ;
4. tests de bout en bout Playwright, en 360 px ;
5. `pnpm audit` (échoue sur les vulnérabilités hautes et critiques) ;
6. scan de secrets avec gitleaks (version fixée, checksum vérifié, historique complet).
