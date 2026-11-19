// Constantes de l'authentification, partagées par l'API, le worker et le client web : les deux
// côtés valident et affichent avec les mêmes valeurs.

/** Longueur minimale d'un mot de passe. */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * Longueur maximale d'un mot de passe : elle borne le coût du hachage (argon2id) d'une entrée
 * hostile, sans gêner une phrase de passe.
 */
export const PASSWORD_MAX_LENGTH = 128;

/** Durée de vie d'un access token : 15 minutes. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Durée de vie d'un refresh token : 30 jours, renouvelée à chaque rotation. */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Durée de validité d'un lien de vérification d'adresse e-mail : 24 heures. */
export const EMAIL_VERIFICATION_TTL_SECONDS = 24 * 60 * 60;

/** Durée de validité d'un lien de réinitialisation du mot de passe : 1 heure. */
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60;

/**
 * Nombre maximal de sessions actives par compte. Au-delà, la plus ancienne est révoquée à la
 * connexion suivante : la liste des sessions reste bornée.
 */
export const MAX_ACTIVE_SESSIONS = 20;

/** Types de compte. */
export const ACCOUNT_TYPES = Object.freeze(/** @type {const} */ (['individual', 'professional']));

/** Langues de l'interface. */
export const LOCALES = Object.freeze(/** @type {const} */ (['fr']));

export const DEFAULT_LOCALE = 'fr';

/** Fuseau par défaut d'un compte : celui de la Côte d'Ivoire (UTC, sans heure d'été). */
export const DEFAULT_TIMEZONE = 'Africa/Abidjan';

/** Longueur maximale d'un prénom ou d'un nom. */
export const PERSON_NAME_MAX_LENGTH = 80;

/** Longueur maximale d'une adresse e-mail (RFC 5321). */
export const EMAIL_MAX_LENGTH = 254;

/**
 * Pages de l'application web vers lesquelles pointent les e-mails. Le jeton est passé dans le
 * fragment de l'URL (`#jeton=...`) : un navigateur ne l'envoie jamais au serveur, il
 * n'apparaît donc ni dans les logs ni dans l'en-tête Referer.
 */
export const AUTH_WEB_PATHS = Object.freeze({
  verifyEmail: '/verifier-email',
  resetPassword: '/reinitialiser-mot-de-passe',
  forgotPassword: '/mot-de-passe-oublie',
  login: '/organisateur/connexion',
});

/** Nom du paramètre du fragment qui porte le jeton envoyé par e-mail. */
export const EMAILED_TOKEN_PARAM = 'jeton';

/** En-tête qui porte le jeton CSRF sur les requêtes qui modifient l'état. */
export const CSRF_HEADER = 'X-CSRF-Token';

/** En-tête qui rend une requête idempotente (voir la règle de concurrence du projet). */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
