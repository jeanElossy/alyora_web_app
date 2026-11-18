# ALYORA — Règles du projet

Plateforme SaaS de gestion d'événements (mariages d'abord), marché Côte d'Ivoire,
français, devise XOF.

## Langue

- Explications, plans et réponses : français.
- Code, noms de variables, commentaires techniques, messages de commit : anglais.
- Textes d'interface : jamais en dur, toujours via i18next.

## Workflow obligatoire

Avant TOUTE modification de code :
1. Expliquer le problème compris, en français.
2. Lister les fichiers qui seront créés ou modifiés.
3. Décrire le plan étape par étape, y compris les permissions et les tests.
4. Signaler les risques et les décisions à arbitrer.
5. ATTENDRE ma validation explicite.

Ne jamais écrire de code avant la validation. Ne jamais élargir le périmètre demandé.
Si une dépendance manque à une tâche, le dire au lieu de l'inventer.

## Stack imposée

- Node 26 LTS, Express 5, Mongoose 9, MongoDB Atlas en replica set.
- React 19, Vite 7, React Router 7, TanStack Query 5, Zustand 5, Tailwind 4.
- Zod 4 côté serveur ET client, schémas partagés dans packages/shared.
- argon2id pour les mots de passe. Jamais bcrypt.
- BullMQ + Redis pour tout traitement long ou différé.
- Vitest, Supertest, mongodb-memory-server, Playwright.
- JavaScript, pas TypeScript. ESM. pnpm workspaces.

Ne jamais introduire une bibliothèque hors de cette liste sans me demander.

## Architecture backend

route -> validateur Zod -> auth -> permission -> controller -> service -> model

- Aucune logique métier dans une route ou un controller.
- Aucun service n'importe req ou res. Un service doit être testable sans Express.
- Chaque service reçoit un contexte explicite { userId, eventId, permissions, session }.
- API sous /api/v1. Erreurs normalisées { code, message, details }.
- Codes d'erreur centralisés dans packages/shared.

## Architecture frontend

- Organisation par fonctionnalité (features/rsvp/), pas par type de fichier.
- components/ui/ contient le design system et rien d'autre.
- TanStack Query pour l'état serveur, Zustand uniquement pour l'état client.
- Jamais de fetch direct dans un composant.
- Découpage du bundle par espace : public, organisateur, accueil, admin.

## Règles de sécurité non négociables

- Toute permission est vérifiée côté serveur. Le front n'est jamais une frontière.
- Toute requête Mongo porte eventId ou organizationId. Sans exception.
- Access token court en mémoire, refresh token en cookie HttpOnly Secure SameSite=Lax,
  avec rotation et détection de réutilisation.
- Jetons d'invitation : 128 bits d'aléa, stockés hachés, révocables.
- Rate limiting sur connexion, mot de passe oublié, RSVP public, contribution, scan.
- Aucun jeton, mot de passe ni coordonnée de paiement dans les logs.
- Secrets uniquement par variables d'environnement, validées par Zod au démarrage.

## Règles métier non négociables

1. Un changement de RSVP ne modifie JAMAIS un plan de table validé.
   Il produit une proposition de correction que l'organisateur valide.
2. Un état de livraison de message n'est jamais un état de confirmation de présence.
3. Un album public ne rend pas ses médias publics : les deux permissions sont
   vérifiées conjointement.
4. Un paiement n'est confirmé qu'après validation du prestataire.
   Un remboursement n'est « remboursé » qu'après confirmation réelle.
5. Les fonds des contributions sont séparés des revenus d'abonnement, dans le code.
6. Les données financières ne sont jamais supprimées avec un événement.
7. Un changement de programme important exige l'approbation de l'organisateur
   avant toute notification.
8. Un collaborateur ne peut jamais accorder une permission qu'il ne détient pas.
9. Les suppressions importantes sont logiques, jamais physiques.

## Argent

- Tout montant est un entier avec sa devise : { amount: 25000, currency: "XOF" }.
- Jamais de nombre à virgule pour un montant. Jamais de montant sans devise.
- Frais, net et reversement stockés séparément, jamais recalculés à l'affichage.
- Pour un paiement en devise étrangère : montant d'origine, taux et équivalent XOF.

## Concurrence

Toute opération touchant une capacité, une unicité, de l'argent ou un quota :
- s'exécute dans une session transactionnelle Mongo avec réessai sur conflit transitoire,
- est idempotente via un en-tête Idempotency-Key et la collection idempotency_keys,
- s'appuie sur un compteur atomique (findOneAndUpdate conditionnel),
  jamais sur un count() suivi d'un save(),
- est protégée par un index unique en dernier recours.

## Dates et fuseaux

- Stockage en UTC, avec le fuseau de l'événement à côté.
- Affichage dans le fuseau du lecteur.
- Jamais de date construite à partir d'une chaîne locale sans fuseau explicite.

## Tests

- Tout service métier a des tests unitaires. Objectif 80 % sur services/ uniquement.
- Toute route a un test d'intégration, dont un test d'accès INTERDIT qui doit échouer.
- Tout code touchant à la concurrence a un test de course.
- Un module n'est pas terminé si ses tests ne passent pas.

## Vocabulaire

Dans le code : event (pas wedding), guest, invitation, rsvp, seating, contribution,
checkin, organization, collaborator. Dans l'interface française : « mariage ».

## Interdits

- Pas de console.log : Pino uniquement.
- Pas de any implicite non documenté dans une fonction financière ou de placement.
- Pas de requête sans pagination sur une collection qui peut dépasser 100 documents.
- Pas de skip/limit au-delà de 200 documents : pagination par curseur.
- Pas de fichier de plus de 300 lignes sans découpage.
- Pas de duplication de logique métier entre front et back : packages/shared.
