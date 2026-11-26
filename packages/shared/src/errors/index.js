/**
 * Catalogue centralisé des erreurs. Toute réponse d'erreur de l'API porte l'un de ces codes.
 *
 * - `httpStatus` : le statut HTTP renvoyé par l'API pour ce code.
 * - `message` : message par défaut, destiné aux développeurs (en anglais). Le client web ne
 *   l'affiche jamais : il traduit le `code` avec i18next.
 */
export const ERROR_CATALOG = Object.freeze({
  VALIDATION_ERROR: Object.freeze({ httpStatus: 400, message: 'Invalid request' }),
  UNAUTHENTICATED: Object.freeze({ httpStatus: 401, message: 'Authentication required' }),
  // Même code, même statut et même message que l'adresse existe ou non, que le compte soit
  // verrouillé ou non : la réponse ne révèle jamais l'existence d'un compte.
  INVALID_CREDENTIALS: Object.freeze({ httpStatus: 401, message: 'Invalid credentials' }),
  INVALID_TWO_FACTOR_CODE: Object.freeze({ httpStatus: 401, message: 'Invalid two-factor code' }),
  // L'opération demande une authentification complète récente : POST /auth/reauthenticate.
  REAUTHENTICATION_REQUIRED: Object.freeze({
    httpStatus: 401,
    message: 'Recent authentication required',
  }),
  FORBIDDEN: Object.freeze({ httpStatus: 403, message: 'Access denied' }),
  // Règle d'escalade : un collaborateur n'accorde jamais une permission qu'il ne détient pas,
  // et ne touche pas à un collaborateur qui en détient davantage.
  PERMISSION_ESCALATION: Object.freeze({
    httpStatus: 403,
    message: 'Permissions beyond your own cannot be granted or changed',
  }),
  // L'opération (transfert de propriété) exige la double authentification activée.
  TWO_FACTOR_REQUIRED: Object.freeze({
    httpStatus: 403,
    message: 'Two-factor authentication must be enabled for this operation',
  }),
  // L'invitation a été envoyée à une autre adresse que celle du compte connecté.
  INVITATION_EMAIL_MISMATCH: Object.freeze({
    httpStatus: 403,
    message: 'This invitation was sent to another e-mail address',
  }),
  EMAIL_NOT_VERIFIED: Object.freeze({ httpStatus: 403, message: 'Email address not verified' }),
  CSRF_INVALID: Object.freeze({ httpStatus: 403, message: 'Missing or invalid CSRF token' }),
  // Jeton reçu par e-mail inconnu, expiré, déjà utilisé ou révoqué : un seul code, pour ne
  // pas renseigner un attaquant sur l'état d'un jeton.
  INVALID_TOKEN: Object.freeze({ httpStatus: 400, message: 'Invalid or expired token' }),
  NOT_FOUND: Object.freeze({ httpStatus: 404, message: 'Resource not found' }),
  TWO_FACTOR_CONFLICT: Object.freeze({
    httpStatus: 409,
    message: 'Two-factor authentication is not in the expected state',
  }),
  // Déjà collaborateur de l'événement, ou une invitation est déjà en attente pour l'adresse.
  COLLABORATOR_CONFLICT: Object.freeze({
    httpStatus: 409,
    message: 'Already a collaborator, or an invitation is already pending',
  }),
  IDEMPOTENCY_CONFLICT: Object.freeze({
    httpStatus: 409,
    message: 'Idempotency key reused for another request, or request still in progress',
  }),
  PAYLOAD_TOO_LARGE: Object.freeze({ httpStatus: 413, message: 'Request body too large' }),
  RATE_LIMITED: Object.freeze({ httpStatus: 429, message: 'Too many requests' }),
  INTERNAL_ERROR: Object.freeze({ httpStatus: 500, message: 'Internal server error' }),
  SERVICE_UNAVAILABLE: Object.freeze({ httpStatus: 503, message: 'Service unavailable' }),
});

/** @typedef {keyof typeof ERROR_CATALOG} ErrorCode */

/**
 * Codes d'erreur sous forme d'objet énuméré ({ VALIDATION_ERROR: 'VALIDATION_ERROR', ... }),
 * dérivé du catalogue : un code n'est déclaré qu'une seule fois.
 */
export const ERROR_CODES = Object.freeze(
  /** @type {{ readonly [K in ErrorCode]: K }} */ (
    Object.fromEntries(Object.keys(ERROR_CATALOG).map((code) => [code, code]))
  ),
);

/**
 * Codes d'erreur produits par le client web lui-même, quand l'API n'a pas pu répondre dans le
 * format normalisé. Séparés du catalogue : ils n'ont pas de statut HTTP, et l'API ne les
 * renvoie jamais.
 *
 * - `NETWORK_ERROR` : la requête n'a pas abouti (hors ligne, DNS, connexion refusée).
 * - `INVALID_RESPONSE` : l'API a répondu, mais pas dans le format attendu.
 */
export const CLIENT_ERROR_CODES = Object.freeze({
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
});

/** @typedef {keyof typeof CLIENT_ERROR_CODES} ClientErrorCode */
