# 0005 — Envoi des e-mails par Brevo

- **Statut** : acceptée
- **Date** : 2026-11-19
- **Complète** : l'ADR 0004 (section E-mails), qui laissait le prestataire à choisir.

## Contexte

Depuis M0.4, l'API rédige les e-mails (vérification d'adresse, réinitialisation, alertes de
sécurité) et les met, chiffrés, dans la file BullMQ `email`. Le worker ne savait que les écrire
dans un dossier local, et refusait de démarrer en production : aucun compte ne pouvait être
vérifié. Les invitations des invités viendront ensuite, avec des pics de plusieurs centaines
d'e-mails par mariage. Le marché est la Côte d'Ivoire, francophone ; le domaine d'envoi sera
`alyora.com`.

## Décision

**Brevo**, appelé par son API HTTP (`POST https://api.brevo.com/v3/smtp/email`), avec le `fetch`
de Node : aucune bibliothèque ajoutée.

Comparaison faite le 2026-11-19, d'après des comparatifs de 2026 (prix à revérifier avant tout
achat) :

| Prestataire | Gratuit                             | Premier palier payant      | Écarté parce que                                                 |
| ----------- | ----------------------------------- | -------------------------- | ---------------------------------------------------------------- |
| **Brevo**   | 300 e-mails/jour, sans limite durée | environ 9 $/mois (5 000)   | — retenu                                                         |
| Resend      | 3 000/mois, 100/jour                | 20 $/mois (50 000)         | 100 par jour : un seul mariage les dépasse.                      |
| Mailjet     | 6 000/mois, 200/jour                | variable selon les sources | Moins complet que Brevo, sans avantage de prix net.              |
| Amazon SES  | fermé aux nouveaux comptes (2026)   | 0,10 $ pour 1 000          | Mise en place lourde ; à revoir au-delà de 100 000 e-mails/mois. |

Brevo l'emporte aussi par son interface et son support en français, et parce qu'il propose
SMS et WhatsApp : des canaux à étudier pour les invités, le moment venu.

## Fonctionnement

- `EMAIL_TRANSPORT=brevo`, seul accepté en production. Le transport `file` reste pour le
  développement et les tests.
- `BREVO_API_KEY` : une clé de l'API (« SMTP & API → API Keys »). Une clé SMTP (`xsmtpsib-`)
  est refusée au démarrage, avec un message qui le dit. La clé n'apparaît dans aucun log.
- `MAIL_FROM_EMAIL` (ex. `no-reply@alyora.com`) et `MAIL_FROM_NAME` (`ALYORA` par défaut).
- Chaque appel a 10 secondes au plus, et ne suit aucune redirection (elle emporterait la clé).
- **Erreurs** :
  - passagères (408, 429, 5xx, réseau, délai dépassé) : le job est retenté selon
    `MAIL_JOB_OPTIONS`, cinq tentatives espacées ;
  - définitives (tout autre refus : clé invalide, IP non autorisée, expéditeur non validé,
    crédits épuisés) : le job échoue tout de suite (`UnrecoverableError` de BullMQ), puisque
    retenter ne changerait rien. Le titulaire peut redemander le lien.
- **Logs** : jamais la clé, le destinataire ni le contenu. On garde le statut HTTP, le code
  d'erreur de Brevo (filtré : lettres et `_` seulement) et l'identifiant du message chez Brevo,
  pour le suivi dans son tableau de bord.

## Conséquences

- **Le domaine doit être authentifié chez Brevo** (DKIM, DMARC, code Brevo, par des
  enregistrements DNS). Brevo remplace toute adresse d'expéditeur gratuite (Gmail, Yahoo...) :
  sans domaine, les e-mails partiraient d'une adresse de Brevo et finiraient souvent en spam.
- **Un doublon est possible** : si Brevo accepte l'e-mail mais que sa réponse se perd, la
  nouvelle tentative l'envoie une seconde fois, à l'identique. Sans gravité pour un lien.
- **Quota** : 300 e-mails par jour suffisent aux comptes. Les invitations demanderont le palier
  payant, et peut-être des envois étalés dans le temps.
- **Sécurité de Brevo** : il peut bloquer une clé utilisée depuis une adresse IP inconnue
  (réponse 401). Il faut alors autoriser les adresses sortantes du worker dans ses réglages.
- **Hébergement** : le worker tourne comme un service séparé (Background Worker sur Render,
  payant), pour qu'une panne de l'un n'arrête pas l'autre.
