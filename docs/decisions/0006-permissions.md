# 0006 — Autorisations et isolation multi-locataire

- **Statut** : acceptée
- **Date** : 2026-11-26
- **Module** : M0.5, livré en trois parties : M0.5a (socle : catalogue, rôles, modèles,
  cloisonnement, résolution, cache, audit, tests types), M0.5b (collaboration : invitations,
  gestion des collaborateurs, règle d'escalade, transfert de propriété), M0.5c (web :
  `usePermissions`, `<Can>`).

## Contexte

Un compte n'accède qu'à ce qui lui est permis, sur les seuls événements qui lui sont rattachés.
C'est le module le plus critique du projet : une erreur ici expose les données d'un mariage
(invités, notes, argent) à un autre locataire.

## Décisions

### Catalogue et rôles (`packages/shared/src/permissions`)

- Catalogue plat, figé, de 28 permissions nommées `module:action` : la seule source de vérité,
  importée par l'API et par le web. `FINANCIAL_PERMISSIONS` liste celles qui donnent accès à
  l'argent : `contributions:read`, `contributions:manage`, `payouts:manage`,
  `exports:financial`.
- Cinq rôles prédéfinis, immuables, définis comme des ensembles de permissions dans
  `roles.js`, et jamais stockés en base : `owner` (tout), `admin` (tout sauf `payouts:manage`),
  `editor`, `reader`, `checkin_agent`. Testé : reader ⊂ editor ⊂ admin ⊂ owner, et ni le
  check-in, ni le reader, ni l'editor n'a de permission financière. Le check-in n'a que
  `event:read`, `checkin:read` et `checkin:scan` : pas les coordonnées des invités.
- Toute décision qui dépend d'un rôle passe par `roles.js` (`isOwnerRole`...). Une règle ESLint
  refuse toute comparaison (`===`, `!==`, `case`) à une clé de rôle écrite en dur ailleurs,
  dans l'API, le worker, le paquet partagé et le web.

### Modèles

- `collaborators` est la **seule source des permissions sur un événement**. Un collaborateur
  porte exactement un rôle (vérifié à la validation) : `roleKey` (prédéfini), `customRoleId`
  (rôle personnalisé de l'organisation) ou `permissions` (liste explicite). Il se révoque
  (`status`, `revokedAt`, `revokedBy`), jamais ne s'efface.
- Index uniques : un collaborateur actif par (événement, compte) ; **un seul propriétaire
  actif par événement** ; une invitation en attente par (événement, adresse) ; (événement,
  empreinte du jeton).
- `organizations` (racine du cloisonnement, filtrée par `_id`), `organization_members`,
  `custom_roles` (cloisonnés par `organizationId`), `collaboration_invitations` (par `eventId`).
- **Être membre d'une organisation ne donne aucun accès à ses événements** : seul un
  collaborateur en a. Les droits propres d'un membre (réglages, rôles personnalisés) et les
  routes des organisations viendront avec leur module.
- **Pas de modèle `events` en M0.5** : `eventId` est un ObjectId que seuls les collaborateurs
  rattachent à une organisation. Le module des événements ajoutera au résolveur la vérification
  qu'un événement existe et n'est pas supprimé.
- Le rôle se nomme `roleKey` (et non `roleId`) : un rôle prédéfini n'a pas d'identifiant en
  base, seulement une clé.

### Cloisonnement (`src/lib/tenancy`)

- Plugin Mongoose `tenantScoped({ keys })`, posé sur chaque modèle cloisonné. Il refuse find,
  findOne, findOneAndUpdate/Delete/Replace, updateOne/Many, deleteOne/Many, replaceOne,
  countDocuments, distinct, estimatedDocumentCount (toujours), un aggregate qui ne commence pas
  par un `$match` cloisonné, et un bulkWrite dont une opération filtrée ne l'est pas.
- Un filtre n'est cloisonné que si l'une des clés est au premier niveau (ou dans une clause
  d'un `$and` de premier niveau) avec une valeur concrète : un ObjectId, `$eq` ou un `$in` non
  vide d'ObjectId. Refusés : `undefined` (vérifié : Mongoose retire la clé, et la requête lit
  toute la collection), `null`, `$exists`, `$ne`, `$nin`, `$in` vide ou contenant `null`, une
  clé présente dans une seule branche d'un `$or`.
- **Refus dans tous les environnements, production comprise** (décision qui s'écarte de la
  spécification initiale, « journaliser seulement en production ») : la requête n'est jamais
  exécutée, le client reçoit une `INTERNAL_ERROR` générique, et une alerte critique est
  journalisée (`tenancy.unscoped_query`, `severity: critical`, modèle, opération, **noms** des
  clés du filtre, jamais leurs valeurs). Une requête non filtrée qui s'exécuterait pourrait
  lire un autre locataire ; un refus ne coûte qu'une fonctionnalité en erreur.
- Conséquences voulues : `findById`, `doc.updateOne()`, `doc.deleteOne()` et `populate` vers
  un modèle cloisonné sont refusés (filtre sur `_id` seul) ; on écrit
  `findOne({ _id, eventId })`. `save()` d'un document lu par une requête cloisonnée reste
  permis.
- **Classement exhaustif** : un test charge tous les fichiers `*.model.js` de `src/` et
  échoue si une collection n'est ni cloisonnée, ni déclarée dans `PLATFORM_COLLECTIONS` (les
  collections de plateforme de l'ADR 0004), ou les deux. Chaque modèle cloisonné passe ensuite
  le test « une requête sans filtre lève une erreur ». Un modèle ajouté par un lot suivant est
  donc vérifié sans que personne ait à y penser.
- Limites : le driver brut (`Model.collection`, réservé aux migrations) contourne le plugin,
  et les sous-pipelines d'un `$lookup` ne sont pas analysés (à vérifier en revue). Une future
  requête légitimement transverse (« mes événements », par `userId`) demandera une
  échappatoire nommée et justifiée ; aucune n'existe en M0.5.

### Résolution et gardes

- `requireEventAccess()` et `requirePermission('guests:write')`, après `requireAuth` (route →
  Zod → auth → permission → controller). Une permission inconnue fait échouer le démarrage.
- Compte qui n'est pas un collaborateur actif, ou événement inconnu : **404 `NOT_FOUND`**, avec
  un corps et des en-têtes identiques dans les deux cas (testé). Jamais 403, qui confirmerait
  l'existence de l'événement. Collaborateur sans la permission : 403 `FORBIDDEN`.
- Le résolveur cherche un rôle personnalisé dans l'organisation du collaborateur seulement :
  un rôle d'une autre organisation, ou supprimé, ne donne aucune permission. Une permission
  absente du catalogue est écartée et signalée.
- Le controller construit le contexte de service avec `eventServiceContext(req)` : compte,
  événement, organisation, permissions. Le service filtre chaque requête avec `eventIdOf(ctx)`.
- `GET /api/v1/events/:eventId/permissions/me` renvoie le rôle et les permissions de
  l'appelant, pour l'affichage du web. Réponse `no-store`.

### Cache des permissions (Redis, 60 secondes)

- Partagé par les instances. Seuls les accès accordés sont mis en cache : un refus ne l'est
  pas, sinon sonder des identifiants d'événement au hasard remplirait Redis.
- **Versionné, pour qu'une lecture lente ne rétablisse jamais un accès révoqué** :
  l'invalidation incrémente un numéro de version et efface l'entrée (transaction Redis) ; la
  lecture note la version avant de lire MongoDB et n'écrit l'entrée (script Lua, atomique) que
  si la version n'a pas changé. Test de course : une lecture bloquée pendant une révocation ne
  remet pas l'accès en cache ; vérifié en remplaçant l'écriture conditionnelle par une écriture
  simple, le test échoue.
- L'invalidation se fait **après la validation** de la transaction qui change un rôle ou
  révoque un accès (M0.5b), jamais pendant.
- Redis injoignable : la résolution passe par MongoDB, qui fait foi. Une invalidation qui
  échoue est journalisée en alerte critique (`access.permission_cache_invalidation_failed`)
  sans faire échouer l'opération, déjà validée : **l'accès révoqué peut survivre au plus
  60 secondes. C'est accepté**, comme les 15 minutes de l'access token (ADR 0004).
- Clés à étiquette de hachage (`{eventId:userId}`) : l'entrée et sa version restent sur le même
  nœud d'un éventuel cluster.

### Journal d'audit (`audit_logs`, `src/lib/audit`)

- Écrit uniquement par `auditLog.record(ctx, entry)`, **dans la session transactionnelle de
  l'action** : une action annulée ne laisse pas de trace, une action validée en laisse toujours
  une. Hors transaction, l'écriture est refusée.
- Champs : `organizationId`, `eventId`, `actorId`, `action` (liste fermée), `targetType`,
  `targetId`, `before`, `after`, `ipHash`, `userAgent` (512 caractères au plus), `createdAt`.
- **L'IP n'est jamais conservée en clair** : son empreinte à clé, la même que celle des
  sessions (ADR 0004), ce qui permet de rapprocher une action d'une session.
- `before` et `after` ne peuvent contenir aucun champ sensible (jeton, mot de passe, e-mail,
  téléphone, note...), reconnu par son nom comme dans les logs, ni dépasser 4 niveaux.
- **En ajout seul** : plugin `appendOnly`, qui refuse toute modification, suppression, bulkWrite
  autre qu'une insertion et `save()` d'une entrée existante.
- Actions déclarées : invitations (créée, révoquée, acceptée), changement de permissions,
  révocation, transfert de propriété, rôles personnalisés, et, pour les lots à venir, lecture
  des notes internes (`notes.read`) et export (`export.created`).

### Tests types réutilisables (`apps/api/test/helpers`)

- `seedEvent()` : une organisation, un collaborateur actif par rôle, un compte étranger, chacun
  avec son access token. `apiAs(app, actor)` : un client HTTP authentifié (CSRF compris).
- `describeTenantResource(spec)`, à appeler pour chaque ressource des lots suivants :
  - un utilisateur de l'événement A ne lit pas une ressource de B : 404 identique à une
    ressource inconnue, par l'événement B, par son propre événement, et pour un compte
    étranger ; la liste de A ne contient pas les ressources de B ;
  - un Reader ne peut rien écrire (403), alors que le propriétaire le peut (contrôle) ;
  - un CheckinAgent n'accède à aucune route financière (403).
- `describeTenantScopedModel(Model)` : une requête sans filtre lève une erreur, sous toutes
  les formes trompeuses.
- Une ressource de démonstration (`test/fixtures/probe-resource.js`) exerce ces tests, avec des
  variantes volontairement fautives (accès non vérifié, 403 qui confirme l'existence, écriture
  sous une permission de lecture, argent sous `event:read`) : chacune fait échouer le test
  correspondant.
- `describePermissionEscalation(spec)` (M0.5b), pour chaque route qui accorde un rôle : un
  Editor ne peut accorder ni une permission absente de son rôle, ni un rôle au-dessus du sien,
  ni le rôle de propriétaire (403 `PERMISSION_ESCALATION`), alors qu'il peut accorder un
  sous-ensemble du sien (contrôle). Appliqué aux invitations et au changement de rôle.
- `read` peut être une opération sur une seule ressource (modification, révocation) quand la
  ressource n'a pas de route de lecture : la liste est alors vérifiée sur une ressource neuve.

### Collaboration (M0.5b)

Routes sous `/api/v1/events/:eventId`, toutes `no-store`, CSRF sur toute route qui modifie
l'état :

| Route                                       | Garde                                                       |
| ------------------------------------------- | ----------------------------------------------------------- |
| `GET /collaborators` (curseur, 100 au plus) | `collaborators:read`                                        |
| `PATCH`, `DELETE /collaborators/:id`        | `collaborators:manage`, règle d'escalade                    |
| `GET /invitations` (curseur, 100 au plus)   | `collaborators:read`                                        |
| `POST /invitations`                         | `collaborators:invite`, escalade, `Idempotency-Key`, limite |
| `DELETE /invitations/:id`                   | `collaborators:invite`, escalade                            |
| `POST /invitations/accept`                  | compte vérifié, `Idempotency-Key`, limites                  |
| `POST /ownership-transfer`                  | propriétaire, authentification récente, 2FA, idempotence    |

- **Règle d'escalade**, avec les permissions de l'acteur **lues en base dans la transaction**,
  jamais depuis le cache ni depuis le contexte de la requête :
  - les permissions accordées (invitation, changement de rôle) sont un sous-ensemble, strict ou
    égal, de celles de l'acteur, sinon 403 `PERMISSION_ESCALATION`, avec la liste des
    permissions manquantes dans `details.issues` ;
  - le rôle de propriétaire ne s'accorde jamais ainsi, même par le propriétaire ;
  - modifier ou révoquer un collaborateur exige que **ses** permissions actuelles soient aussi
    incluses dans celles de l'acteur : un administrateur ne touche donc pas au propriétaire ;
  - le propriétaire n'est ni modifiable ni révocable, et personne ne modifie son propre accès
    (403 `FORBIDDEN`) : le propriétaire change par un transfert ;
  - révoquer une invitation suit la même inclusion.
- **Invitations** : jeton de 128 bits d'aléa (22 caractères base64url), empreinte SHA-256 en
  base, jamais renvoyé par l'API. Valables 7 jours. Le lien de l'e-mail
  (`/invitation#evenement=…&jeton=…`) porte l'événement et le jeton dans le fragment, si bien
  que l'invitation se cherche toujours par (événement, empreinte). Une adresse qui a déjà accès,
  ou une invitation en attente, donne 409 `COLLABORATOR_CONFLICT` ; une invitation périmée ne
  bloque plus l'adresse (statut `expired`). L'e-mail part après la validation ; s'il ne peut être
  mis en file, l'échec est journalisé, l'invitation reste (révoquer puis réinviter). La page web
  d'acceptation viendra avec les écrans de l'équipe.
- **Acceptation** : réservée au compte dont l'adresse est l'adresse invitée (403
  `INVITATION_EMAIL_MISMATCH`). L'escalade est revérifiée à ce moment : un inviteur révoqué ou
  rétrogradé depuis ne fait entrer personne. Jeton inconnu, expiré, révoqué, déjà accepté, ou
  inviteur sans les droits : 400 `INVALID_TOKEN`, sans dire lequel.
- **Transfert de propriété** : seul le propriétaire, avec la 2FA active (403
  `TWO_FACTOR_REQUIRED`, garde `requireTwoFactorEnabled`) et une authentification de moins de
  10 minutes (`requireRecentAuth`), qui inclut alors le code. La cible est un collaborateur
  actif ; l'ancien propriétaire devient administrateur. Réponse 200 avec un corps, pour que
  l'idempotence rejoue un transfert déjà fait au lieu de le réexécuter (une réponse 204 sans
  corps n'est pas enregistrée).
- Chaque changement est journalisé dans sa transaction (`invitation.created`, `.revoked`,
  `.accepted`, `collaborator.permissions_changed`, `collaborator.revoked`,
  `ownership.transferred`), sans adresse e-mail, et le cache des permissions de la cible est
  invalidé après la validation : une révocation prend effet à la requête suivante (testé).
- L'idempotence est liée au compte, à l'événement et au corps : une même clé présentée par un
  autre compte est un conflit, jamais le rejeu d'une réponse qui ne lui appartient pas.
- Limites (Redis, bloquantes si Redis tombe) : 50 invitations par heure et par compte ;
  acceptations, 20 par 15 minutes et par IP, 10 par 15 minutes et par compte.
- La liste de l'équipe montre le nom des membres, jamais leur adresse.
- **Concurrence** (tests de course) : une invitation présentée 5 fois en même temps donne un
  seul collaborateur ; une adresse invitée 5 fois en même temps, une seule invitation et un seul
  e-mail ; trois transferts simultanés, exactement un propriétaire ; un changement de rôle et une
  révocation simultanés laissent un état cohérent, une entrée d'audit par opération réussie.

### Web : `usePermissions` et `<Can>` (M0.5c)

- `features/permissions/` : `usePermissions(eventId)` lit `GET /events/:eventId/permissions/me`
  par le client API (TanStack Query, clé `permissions.mine(eventId)`), et renvoie `can()`, le
  rôle et les permissions. Les permissions sont gardées 60 secondes, comme le cache de l'API,
  et effacées avec tout le cache quand la session prend fin.
- `<Can eventId permission fallback>` affiche ses enfants seulement si la permission est
  détenue ; rien pendant le chargement ; `fallback` si elle manque ou si la lecture échoue
  (404 d'un événement étranger). Plusieurs `<Can>` du même événement font une seule requête.
- Une permission absente du catalogue lève une erreur (`can()`), comme `requirePermission` côté
  API : une faute de frappe ne masque rien en silence. Le typage JSDoc la refuse déjà.
- **Rappelé en tête des deux fichiers : c'est un confort d'affichage, jamais une sécurité.**
  Ce qui est masqué reste accessible à qui modifie la page ou appelle l'API ; seule l'API
  protège les données, en vérifiant chaque permission sur chaque requête.

### Controllers

- Une règle ESLint interdit à un `*.controller.js` d'importer un modèle ou Mongoose : un
  controller passe par un service.

## Conséquences

- Aucune dépendance ajoutée.
- `createApp` reçoit une dépendance de plus, `permissionCache` (Redis en production, mémoire
  dans les tests) ; `bootstrap` désigne le logger des alertes du cloisonnement.
- Toute nouvelle collection doit être classée (cloisonnée ou plateforme), sinon la suite de
  tests échoue.
- Les modules suivants exposent leurs routes sous `/events/:eventId/...`, gardées par
  `requirePermission`, et leurs tests appellent `describeTenantResource` (et
  `describePermissionEscalation` pour une route qui accorde des permissions).
- M0.5b ajoute quatre codes d'erreur (`PERMISSION_ESCALATION`, `TWO_FACTOR_REQUIRED`,
  `INVITATION_EMAIL_MISMATCH`, `COLLABORATOR_CONFLICT`), traduits par le client web, et met en
  commun la rédaction des e-mails (`lib/mail/compose-email.js`) entre l'authentification et
  les autorisations.
- Les rôles personnalisés n'ont pas encore de routes (module des organisations) : changer les
  permissions d'un rôle personnalisé devra invalider le cache de tous ses porteurs (index
  `organization_custom_role`).
