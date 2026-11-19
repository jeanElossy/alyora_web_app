# 0003 — Socle de l'application web (React)

- **Statut** : acceptée
- **Date** : 2026-11-19
- **Module** : M0.3 (socle React de l'application web), livré en deux parties : M0.3a (socle)
  et M0.3b (design system, formulaires, page de démonstration).

## Contexte

L'application doit router, appeler l'API, afficher ses erreurs et fournir un design system,
sans aucun écran métier. Elle vise d'abord le mobile (360 px) et un réseau lent : le bundle
initial de l'espace public est limité à 180 Ko compressés.

## Décisions

### Espaces et routage

- Quatre espaces, chacun dans son propre bundle : public et invités (`/`), organisateur
  (`/organisateur`), accueil des invités (`/accueil`), administration (`/admin`).
- React Router 7 en mode data router (`createBrowserRouter`). L'arbre des routes, dans le
  bundle initial, ne contient que la structure ; chaque route charge ses composants par
  `lazy`, depuis un module unique par espace (`src/spaces/<espace>/<espace>-space.jsx`), si
  bien que Vite produit un bundle par espace.
- Les espaces protégés passent par une garde, qui est un loader : elle s'exécute avant le
  rendu, et un espace protégé ne s'affiche jamais sans session, même brièvement. Sans access
  token en mémoire, elle tente un refresh silencieux (rechargement de page). Si l'API le
  refuse, elle redirige vers `/<espace>/connexion?retour=<page demandée>`. Une panne passagère
  (réseau, erreur du serveur) ne dit rien de la session : la page d'erreur de l'espace
  s'affiche, avec « Réessayer », sans renvoyer vers la connexion.
- La garde n'est qu'un confort d'interface : le serveur vérifie chaque permission. Le bundle
  d'un espace protégé reste téléchargeable par tous et ne contient aucun secret.
- Chaque espace a sa mise en page, sa navigation et sa page 404. Un visiteur sans session qui
  demande une page inconnue d'un espace protégé est redirigé vers la connexion avant d'apprendre
  si la page existe.
- Les pages de connexion, d'abord des coquilles sans formulaire, sont depuis M0.4c celles du
  bundle des pages du compte (ADR 0004).

### Client API

- `src/lib/api/api-client.js` est le seul code qui appelle `fetch` (règle ESLint). Cookies
  inclus, access token en en-tête `Authorization`.
- Toute erreur devient une `ApiError` typée : `code`, `status`, `details`, `requestId`. Un
  corps au format `{ code, message, details }` (validé par le schéma partagé) garde son code ;
  une réponse dans un autre format devient `INVALID_RESPONSE`, une requête qui n'a pas abouti
  `NETWORK_ERROR` (statut 0). Ces deux codes, propres au client, sont dans
  `packages/shared/src/errors` (`CLIENT_ERROR_CODES`), séparés du catalogue de l'API.
- Sur un 401, un seul refresh est lancé, quel que soit le nombre de requêtes en vol : elles
  attendent toutes la même promesse, puis chacune est rejouée une fois, sans boucle. Une
  requête qui part pendant un refresh attend sa fin. Un 401 qui arrive après la fin d'un
  refresh n'en relance pas un autre : rejoué avec le nouveau jeton si le refresh a réussi, il
  échoue comme lui sinon. Chaque requête retient pour cela le nombre de refresh terminés au
  moment de son envoi (correction de la clôture de M0.3 : un 401 tardif relançait un refresh).
- Seul un refus définitif du refresh met fin à la session, une seule fois quel que soit le
  nombre de requêtes en attente : une réponse 4xx de l'API, sauf 408 et 429
  (`isDefinitiveRejection`). Une panne passagère la garde : requête qui n'aboutit pas, 5xx,
  réponse d'un proxy, 408, 429, réponse illisible avec un statut de succès. La requête échoue
  alors avec l'erreur du refresh, que TanStack Query réessaie si c'est une panne réseau ou une
  5xx.
- **Contrat provisoire** : `POST /api/v1/auth/refresh`, refresh token dans un cookie HttpOnly,
  réponse `{ accessToken }` (`refreshSessionResponseSchema`, dans `packages/shared`). Le module
  d'authentification le confirmera ou le fera évoluer.
- `VITE_API_BASE_URL` est validée au démarrage : URL http(s) ou chemin absolu, sans barre
  finale. Vide, l'API est cherchée sur la même origine (`/api/v1`).

### État

- État serveur : TanStack Query. `staleTime` de 30 s par défaut (au lieu de 0, qui referait une
  requête à chaque montage, coûteux sur un réseau mobile). Aucune nouvelle tentative sur une
  erreur 4xx ; deux au plus sur une erreur réseau ou 5xx ; aucune sur une mutation.
- Les clés de requête sont toutes déclarées dans `src/app/queryKeys.js`.
- État client : Zustand. L'access token est gardé en mémoire seulement
  (`src/lib/session/session-store.js`), jamais dans `localStorage`.

### Traductions

- i18next, français seul, initialisé de façon synchrone avec les textes communs (erreurs,
  chargement). Chaque espace a son fichier `locales/fr.json`, chargé avec son bundle.
- Aucun texte en dur : une règle ESLint refuse le texte dans le JSX et dans les attributs lus
  par l'utilisateur (`aria-label`, `title`, `alt`, `placeholder`, `label`...).
- Les tests passent l'interface dans la langue `cimode` d'i18next, où chaque texte affiché est
  sa clé : un texte qui ne passe pas par i18next s'y voit.
- Typographie française : apostrophe typographique (’), espace fine insécable avant « : ».

### Erreurs

- Frontière d'erreur à la racine et sur chaque espace (`ErrorBoundary` de React Router).
- La page d'erreur affiche un titre et un message traduits, et pour une erreur de l'API
  l'identifiant de corrélation (référence pour le support). Jamais le message d'erreur, la
  pile, un nom de fichier ou un statut technique.

### Charte, contrastes et typographie

Contrastes WCAG calculés (AA : 4,5:1 pour le texte courant, 3:1 pour un contour ou un
élément d'interface) :

| Combinaison            | Ratio | Usage                                    |
| ---------------------- | ----- | ---------------------------------------- |
| charcoal / ivory       | 13,58 | texte courant                            |
| forest / ivory         | 10,93 | titres, liens, contour de focus          |
| charcoal / champagne   | 7,73  | texte sur fond champagne                 |
| champagne / forest     | 6,22  | texte sur fond vert                      |
| champagne-deep / ivory | 5,00  | texte doré sur fond clair (`#786745`)    |
| muted / ivory          | 6,24  | texte secondaire (`#5F5A51`)             |
| danger / ivory         | 6,09  | erreurs (`#A8321F`)                      |
| warning / ivory        | 5,40  | alertes (`#8A5A00`)                      |
| **champagne / ivory**  | 1,76  | **interdit** pour du texte et un contour |
| **champagne / blanc**  | 1,93  | **interdit**                             |
| **forest / charcoal**  | 1,24  | **interdit**                             |

- Le champagne ne sert qu'en accent (filets décoratifs, fonds) ; sur fond clair, le texte doré
  utilise `champagne-deep`. La palette par défaut de Tailwind est retirée : seules ces couleurs
  existent.
- Direction visuelle : moderne et épurée, demandée par le responsable du projet. En-tête clair
  et translucide séparé par un filet, marque en capitales espacées, navigation en liens
  discrets (l'actif souligné), grands titres éditoriaux, beaucoup d'espace, boutons arrondis.
  L'accueil public présente la marque (accroche, photo en arche, trois temps) sans aucune
  fonctionnalité ; la connexion est un écran partagé sur grand écran.
- Photos d'ambiance générées par Figma AI (modèle gpt-image-2.5-flare) à la demande du
  responsable du projet : aucune personne réelle, aucun texte. Elles sont dans
  `src/assets/images/`, en WebP et en plusieurs largeurs (`srcset`, `sizes`) : un téléphone ne
  télécharge que la version qui lui suffit. La photo de la section d'ouverture est prioritaire
  (`fetchpriority="high"`), les autres sont chargées en différé. Décoratives, elles ont un texte
  alternatif vide. Le fichier Figma source (« ALYORA – Images des pages ») est dans les
  brouillons du compte Figma du projet.
- Polices hébergées avec l'application (paquets Fontsource), jamais depuis un CDN : Inter
  (variable) pour le texte, avec ses variantes `cv11` (a à un seul étage) et `ss01` ; Cormorant
  Garamond pour les titres, en 500 et 600 seulement. Le navigateur ne télécharge que les
  sous-ensembles de caractères dont la page a besoin.

### Logo et mouvement

- Logo fourni par le responsable du projet, détouré (fond ivoire rendu transparent, bords lissés
  conservés) en trois versions, dans `src/assets/brand/` : couleur pour les fonds clairs, nom et
  signature en ivoire pour les fonds sombres, emblème seul. WebP en deux densités. L'emblème
  accompagne le nom dans l'en-tête et le pied de page des espaces (décoratif : le nom nomme le
  lien) ; le logo complet ouvre les pages du compte. Favicons et icône Apple dans `public/`.
- Mouvement en CSS seulement, sans bibliothèque : apparition douce des titres et des cartes
  (`animate-rise`, décalée de 100 à 300 ms), zoom très lent des grandes photos (`animate-drift`),
  sections révélées au défilement (`reveal-on-scroll`, animations liées au défilement là où le
  navigateur les connaît, rien sinon), léger zoom des photos au survol. Tout est neutralisé pour
  qui demande moins de mouvement.

### Budget

- `pnpm build` lance `scripts/check-bundle-budget.js` : il lit le manifeste de Vite, affiche le
  bundle propre et le bundle initial (point d'entrée, imports statiques, CSS) de chaque espace,
  et échoue si celui de l'espace public dépasse 180 000 octets en gzip. Les polices n'y sont
  pas comptées.
- Au socle (M0.3a) : 164,6 Ko ; avec le design system (M0.3b) : 167,6 Ko. React DOM (65 Ko), React Router (32 Ko), Zod (23 Ko, pour valider
  les réponses d'erreur avec le schéma partagé) et i18next (16 Ko) en font l'essentiel. Les
  photos ne sont pas comptées : ce ne sont pas du code, et elles se chargent après lui.

### Design system (M0.3b)

- 19 composants dans `src/components/ui/`, et rien d'autre : Button, Input, Select, Textarea,
  Checkbox, Radio (RadioGroup), Modal, Drawer, Toast, Card, Badge, Table, Tabs, Tooltip,
  Avatar, Spinner, EmptyState, Pagination, Skeleton, plus Field (libellé, aide, erreur).
  Construits sur les primitives Radix (paquet unifié `radix-ui`) quand le comportement
  clavier est complexe (Select, Checkbox, RadioGroup, Dialog, Toast, Tabs, Tooltip, Avatar),
  en HTML natif sinon.
- Aucun texte en dur : les textes arrivent traduits par l'appelant, ou viennent de l'espace de
  noms i18next « ui » (fermer, chargement, pagination, messages de validation).
- Bordure des champs et des cases : jeton `outline` (`#857F76`, 3,97:1 sur blanc, 3,61:1 sur
  ivoire), car un contrôle doit se distinguer à 3:1 au moins (WCAG 1.4.11). Les filets
  décoratifs restent à faible opacité.
- Focus visible sur tout élément interactif (règle globale du thème). Mouvements réduits : les
  animations deviennent quasi instantanées.
- Pagination par curseur (précédent, suivant), conforme à la règle du projet sur les grandes
  collections.
- Notifications : la file (`toast-store.js`, Zustand) est dans le bundle initial, leur
  affichage Radix n'est chargé qu'à la première notification. Monté d'office, il ajoutait
  13 Ko et faisait dépasser le budget (180,2 Ko). Une notification survit au rendu qui l'a
  créée : `toast()` reçoit donc des clés de traduction et leur espace de noms, traduites à
  l'affichage, pour qu'une notification ouverte suive un changement de langue. C'est la seule
  exception à la règle « les textes arrivent traduits ».
- Infobulle : Radix la ferme quand la page défile, y compris quand le focus clavier fait
  défiler jusqu'au déclencheur. Une infobulle ne porte donc jamais seule une information
  indispensable.

### Formulaires (M0.3b)

- `useZodForm(schema)` branche React Hook Form (`@hookform/resolvers`) sur un schéma Zod de
  `packages/shared`. Les messages de Zod ne sont jamais affichés : chaque problème devient une
  clé `form.errors.*` traduite (obligatoire, trop court avec le minimum, e-mail invalide, case
  à cocher...). Quand la langue change, les champs en erreur sont revalidés.
- `Form` désactive tous les contrôles pendant l'envoi (`fieldset disabled`, bouton compris).
  Une erreur VALIDATION_ERROR de l'API s'affiche sous chaque champ concerné, le premier reçoit
  le focus une fois le formulaire réactivé ; toute erreur s'affiche aussi en tête du
  formulaire, traduite depuis son code. Une erreur inattendue donne le message générique.
  Les erreurs de l'API sont enregistrées sous forme de clés de traduction et traduites à
  l'affichage : elles suivent un changement de langue, comme celles du schéma.
- Le schéma de la démonstration (`designSystemDemoFormSchema`) est dans `packages/shared`,
  marqué comme démonstration sans valeur métier.

### Page /design-system (M0.3b)

- Tous les composants dans tous leurs états, en sections, avec un sélecteur de langue qui
  passe en langue des clés. Elle appelle aussi l'API (`GET /ping`) par TanStack Query.
- Présente en développement, et dans un build qui l'active (`VITE_ENABLE_DESIGN_SYSTEM=true`,
  pour les tests de bout en bout). Dans le build de production, la condition vaut `false` à la
  compilation : ni la route ni son bundle n'existent. Le rapport du build l'indique.

### Tests

- Vitest et Testing Library (jsdom) : client API (dont les tests de course du refresh), garde
  de session, TanStack Query, traductions, routage de chaque espace (dont l'accès sans session,
  qui doit être refusé), page d'erreur, composants du design system (clavier, rôles, noms
  accessibles), formulaires.
- Playwright, en 360 px, sur le build de production : mise en page et navigation de chaque
  espace, absence de défilement horizontal, redirection sans session, page d'erreur (et non
  de connexion) quand l'API est injoignable, refresh silencieux, 404 par espace, bundles
  chargés à la demande, lien d'évitement au clavier. Sur la page
  /design-system : les 19 composants visibles, la page entière parcourue au clavier avec un
  focus visible à chaque arrêt, fenêtre et panneau (focus piégé, Échap, focus rendu), liste,
  onglets, infobulle, notification, formulaire (erreurs, envoi, erreur de l'API), appel à
  l'API, et aucun texte hors traductions en langue des clés.

### Dépendances

Validées avant le module, à leur version la plus récente publiée depuis au moins 7 jours (une
version compromise est en général retirée en quelques jours) : react-router 7.18.5 (la 8 existe,
la stack impose la 7), @tanstack/react-query 5.107.1, zustand 5.1.0, i18next 27.1.1,
react-i18next 18.0.1, tailwindcss et @tailwindcss/vite 4.3.5, @fontsource-variable/inter et
@fontsource/cormorant-garamond 5.3.0, et pour les tests @testing-library/react 16.3.3,
@testing-library/user-event 14.6.9, jsdom 31.0.0, @playwright/test 1.65.0. S'y ajoutent
@testing-library/dom 10.4.2 (dépendance pair obligatoire de @testing-library/react) et
@types/node (déjà utilisé par l'API et le worker). M0.3b : radix-ui 1.8.1, react-hook-form
7.92.0, @hookform/resolvers 7.0.6.

## Conséquences

- Le paramètre `retour` de la page de connexion est validé depuis M0.4c (`safeReturnPath`) : un
  chemin de l'application seulement. Les coquilles de connexion ont été remplacées par les
  pages du compte (ADR 0004).
- Le cookie de refresh (`SameSite=Lax`) n'est envoyé que si l'application et l'API sont sur le
  même site (par exemple `app.<domaine>` et `api.<domaine>`).
- Il reste environ 20 Ko de marge sur le budget public : toute dépendance chargée d'office
  doit être pesée, et le rapport du build le montre à chaque pull request.
