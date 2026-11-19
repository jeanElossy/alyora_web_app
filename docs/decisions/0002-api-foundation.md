# 0002 — Socle de l'API (Express 5)

- **Statut** : acceptée
- **Date** : 2026-11-18
- **Module** : M0.2 (socle Express 5 de l'API)

## Contexte

L'API doit démarrer de façon sûre, se connecter à MongoDB et Redis, journaliser sans fuite,
normaliser ses erreurs et se tester, avant toute ressource métier.

## Décisions

### Configuration

- Les variables sont validées par un schéma Zod (`src/config/env.schema.js`). En cas
  d'erreur, le processus journalise le **nom** des variables fautives, jamais leur valeur,
  puis sort avec le code 1.
- `NODE_ENV`, `MONGODB_URI` et `REDIS_URL` n'ont jamais de valeur par défaut. Les variables
  de réglage (`PORT`, `LOG_LEVEL`, `CORS_ORIGINS`, `TRUST_PROXY`, `MONGODB_MAX_POOL_SIZE`)
  ont une valeur par défaut en développement et en test seulement, annoncée au démarrage.
  En production, tout est obligatoire. Une valeur vide compte comme absente.
- Seules les variables lues par le code sont validées. Les variables d'authentification le
  seront par le module qui les utilisera.
- `TRUST_PROXY` est un nombre de proxys ou `false`. `true` est refusé : n'importe quel client
  pourrait alors usurper son IP et contourner le rate limiting.

### Démarrage et arrêt

- Ordre : configuration, logger, MongoDB, Redis, puis écoute HTTP. Tout échec au démarrage
  arrête le processus (code 1), et la plateforme le relance (fail fast). Après le démarrage,
  la reconnexion est confiée aux drivers, qui la journalisent.
- MongoDB doit être un replica set (ou un routeur mongos), **dans tous les environnements** :
  les transactions imposées par les règles du projet échoueraient sinon.
- SIGTERM ou SIGINT : arrêt du serveur HTTP, fin des requêtes en cours (10 s au plus),
  fermeture de MongoDB puis de Redis. `uncaughtException` et `unhandledRejection` :
  log `fatal`, arrêt (5 s au plus), code 1.

### Logs

- Pino, JSON, horodatage ISO UTC, sortie standard synchrone (une ligne `fatal` est écrite
  avant la sortie du processus).
- Identifiant de corrélation par requête, dans l'en-tête `X-Request-Id`. Une valeur entrante
  n'est reprise que si elle est sûre (`^[A-Za-z0-9_-]{8,64}$`). Il est propagé par
  AsyncLocalStorage : tout log écrit pendant la requête le porte, y compris depuis un service.
  Le worker utilisera `runWithContext()` pour donner à un job l'identifiant de la requête
  qui l'a créé.
- Le contexte est ouvert **après** la lecture du corps : le flux du corps émet ses
  événements hors contexte, et le contexte serait perdu sinon.
- Une requête est journalisée par sa méthode et son chemin seulement : ni en-têtes, ni query
  string, ni corps. Les sondes `/health` et `/ready` ne sont pas journalisées.
- **Masquage, appliqué au dernier moment** (hook `streamWrite` de Pino, sur chaque ligne
  sérialisée), en deux couches :
  1. par nom de champ, à toute profondeur (`isSensitiveKey`, dans `src/lib/logger/redact.js`).
     Le nom est découpé en mots (camelCase, snake_case, kebab-case) et mis en minuscules.
     - Termes cherchés n'importe où dans le nom : authorization, cookie, password, passwd,
       motdepasse, secret, token, credential, signature, apikey, privatekey, accesskey, email,
       phone, mobile, whatsapp, msisdn, partyid (numéro du payeur chez MTN MoMo), wallet,
       accountnumber, iban, card, cvv.
     - Termes courts reconnus en mot entier seulement : pin, otp, cvc, pan, tel, note, notes.
       Sinon « mapping » contiendrait « pin », « footprint » « otp » et « company » « pan ».
       Un faux positif masque seulement une valeur (« discard » contient « card »), un faux
       négatif la laisse fuir ;
  2. par valeur : les valeurs que le client a envoyées sous un de ces noms (corps, query,
     `Authorization`, cookies) sont effacées de tout texte de la ligne, message d'erreur
     compris. Les valeurs de moins de 6 caractères ne sont masquées que par nom.
- Le masquage natif de Pino ne suffit pas : vérifié, `*.password` ne masque que le premier
  niveau. Et Pino réinitialise son formateur de champs sur chaque logger enfant : un
  formateur ne verrait pas les champs liés par pino-http ou par `logger.child()`.
- Les erreurs sont journalisées par type, message, pile, code et cause. Leurs autres
  propriétés sont ignorées : body-parser y recopie le corps brut.

### Erreurs

- Catalogue des codes et de leur statut HTTP dans `packages/shared/src/errors`.
- `AppError(code, { message, details, cause })` pour les erreurs attendues. Toute autre
  erreur devient un `INTERNAL_ERROR` générique ; l'original n'est que dans les logs.
- Réponse toujours `{ code, message, details }`, les trois clés présentes : `details` vaut
  `{}` quand l'erreur n'a pas de détails, si bien que le client lit toujours un objet.
  `details` est strict : `{ issues?: [{ path, code, message }] }`, sans les valeurs reçues. **Aucune pile dans les
  réponses, quel que soit l'environnement** : la pile se retrouve dans les logs grâce à
  `X-Request-Id`.
- `message` est en anglais, pour les développeurs. Le front traduit le `code` avec i18next.
- Les erreurs de body-parser (JSON mal formé, corps trop gros) sont traduites sans recopier
  leur message, qui cite le corps brut.

### HTTP

- Ordre des middlewares : corrélation, pino-http, helmet, CORS, compression, JSON (100 ko),
  contexte de requête, sondes, rate limit `/api/v1`, routes, 404, erreurs.
- CORS : liste blanche d'origines exactes, `credentials: true` (cookie de refresh à venir).
  Une origine refusée ne reçoit aucun en-tête CORS.
- Rate limit global sur `/api/v1` : 1000 requêtes par 15 minutes et par IP. Le plafond est
  large parce que les opérateurs mobiles partagent une IP entre beaucoup d'abonnés (CGNAT).
  Les compteurs sont dans Redis, incrémentés par un script Lua atomique. Si Redis tombe, la
  limite globale laisse passer et journalise ; les limites sensibles futures bloqueront.
- Une commande Redis sans réponse échoue après 500 ms (`commandTimeout`). Sans ce délai, un
  Redis qui ne répond plus sans fermer la connexion (processus gelé, partition réseau)
  bloquait toutes les requêtes `/api/v1`, et le rate limit ne laissait jamais passer : constaté
  au démarrage réel contre un Redis suspendu.
- `validate(schema, source)` range la valeur validée hors de `req`, lue par
  `getValidated(req, source)`. Express 5 rend `req.query` non modifiable, et checkJs ne peut
  pas étendre le type `Request` d'Express sans fichier `.d.ts`.
- Une route est décrite une seule fois (`defineRoute`) : cette définition sert à la monter,
  avec ses validateurs, et à générer le document OpenAPI 3.1 (`z.toJSONSchema` natif de
  Zod 4). Le document est servi sur `/api/v1/docs`, hors production uniquement.

### Migrations

- migrate-mongo, en ESM. L'historique est dans `migrations_changelog`, avec un verrou
  (`migrations_lock`, 300 s) pour que deux déploiements simultanés ne migrent pas deux fois.

### Tests

- Vitest, Supertest, et un replica set mongodb-memory-server (MongoDB 8.0.37, la version du cluster Atlas) démarré une
  fois par exécution. Chaque worker de test a sa propre base, vidée avant chaque test.
- Un vrai Redis (image Docker `redis:8`, port aléatoire de 127.0.0.1, sans persistance) est
  démarré une fois par exécution par le setup global, puis supprimé. Les tests y isolent leurs
  clés par un préfixe unique. `REDIS_TEST_URL` désigne un Redis existant à la place : les
  tests y écrivent des clés `rl:test-*`, qui expirent en une minute.
- Le rate limit adossé à Redis a des tests de course : 50 requêtes simultanées pour une limite
  de 10, sur une instance puis sur deux instances qui partagent Redis, laissent passer
  exactement 10 requêtes. Vérifié : un stockage qui lit puis écrit en laisse passer davantage.
- Un faux client Redis reste utilisé pour les sondes, et un stockage en mémoire pour les tests
  de limite qui ne portent pas sur Redis.
- Couverture v8 sur `src/lib`, seuil de 80 % (lignes, instructions, fonctions, branches) :
  en dessous, `pnpm test` échoue.

### Exceptions à la règle « toute requête porte eventId ou organizationId »

Ces opérations sont techniques et transverses par nature : commandes `hello` et `ping`,
collections `migrations_changelog` et `migrations_lock`, nettoyage des bases de test.

## Conséquences

- Dépendances ajoutées, validées avant le module : express, mongoose, mongodb (pair de
  migrate-mongo, aligné sur la version de Mongoose), pino, pino-http, helmet, cors,
  compression, express-rate-limit, rate-limit-redis, ioredis, migrate-mongo ; en
  développement : supertest, mongodb-memory-server, @vitest/coverage-v8 et les types
  @types/express, @types/cors, @types/compression, @types/supertest.
- Le script d'installation de mongodb-memory-server est explicitement refusé
  (`pnpm-workspace.yaml`) : le binaire est téléchargé au premier test, et mis en cache en CI.
- Un message d'erreur composé par une bibliothèque à partir de données qui ne viennent pas
  de la requête (par exemple la valeur en double d'une erreur E11000 lors d'un import) n'est
  pas masqué par valeur. À traiter dès le premier index unique.
- Le chemin d'une requête est journalisé tel quel. Une route qui porte un jeton dans son
  chemin (lien d'invitation) devra journaliser le modèle de route, pas le chemin réel.
- La compression devra être désactivée sur les réponses qui contiennent des jetons
  (risque de type BREACH), au module d'authentification.
