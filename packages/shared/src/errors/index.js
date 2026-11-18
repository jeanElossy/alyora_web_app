/**
 * Centralized error codes. Every API error response carries one of them.
 */
export const ERROR_CODES = Object.freeze(
  /** @type {const} */ ({
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    UNAUTHENTICATED: 'UNAUTHENTICATED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
  }),
);

/** @typedef {(typeof ERROR_CODES)[keyof typeof ERROR_CODES]} ErrorCode */
