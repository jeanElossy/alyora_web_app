import { isApiError } from '../api/api-error.js';

/** Code Zod renvoyé par l'API → clé de message (form.errors.*). Sans valeurs : l'API ne les renvoie pas. */
const SERVER_ISSUE_KEYS = Object.freeze({
  invalid_format: 'invalid_format',
  invalid_type: 'invalid_type',
  invalid_value: 'invalid_value',
});

/**
 * Affiche dans le formulaire l'erreur d'un envoi :
 * - chaque problème VALIDATION_ERROR de l'API qui désigne un champ du formulaire s'affiche sous
 *   ce champ ;
 * - l'erreur elle-même s'affiche en tête du formulaire (`root.server`), traduite depuis son
 *   code. Une erreur qui n'est pas une ApiError (bug) devient le message générique.
 *
 * @param {import('react-hook-form').UseFormReturn<any>} form
 * @param {unknown} error
 * @param {(key: string, options?: Record<string, unknown>) => string} t Traduction de « ui ».
 * @returns {string | undefined} Le premier champ en erreur, à qui donner le focus une fois le
 *   formulaire réactivé (un champ désactivé ne peut pas le recevoir).
 */
export function applyServerErrors(form, error, t) {
  if (!isApiError(error)) {
    form.setError('root.server', {
      type: 'INTERNAL_ERROR',
      message: t('errors.INTERNAL_ERROR', { ns: 'common' }),
    });
    return undefined;
  }
  const fieldNames = new Set(Object.keys(form.getValues()));
  /** @type {string | undefined} */
  let firstField;
  for (const issue of error.details.issues ?? []) {
    if (fieldNames.has(issue.path)) {
      const key = SERVER_ISSUE_KEYS[/** @type {keyof typeof SERVER_ISSUE_KEYS} */ (issue.code)];
      form.setError(issue.path, { type: 'server', message: t(`form.errors.${key ?? 'invalid'}`) });
      firstField ??= issue.path;
    }
  }
  form.setError('root.server', {
    type: error.code,
    message: t(`errors.${error.code}`, { ns: 'common' }),
  });
  return firstField;
}
