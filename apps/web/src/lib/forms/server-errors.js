import { isApiError } from '../api/api-error.js';

/**
 * Type des erreurs de champ venues de l'API. Leur message est une clé de traduction de l'espace
 * de noms « ui » (form.errors.*), traduite à l'affichage (voir fieldErrorText) : il suit ainsi
 * un changement de langue. Les erreurs du schéma, elles, sont traduites à la validation, et
 * revalidées quand la langue change (voir useZodForm).
 */
export const SERVER_ERROR_TYPE = 'server';

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
 * Les messages enregistrés sont des clés de traduction : `form.errors.*` (« ui ») pour un
 * champ, `errors.*` (« common ») pour la tête du formulaire. Ils sont traduits à l'affichage.
 *
 * @param {import('react-hook-form').UseFormReturn<any>} form
 * @param {unknown} error
 * @returns {string | undefined} Le premier champ en erreur, à qui donner le focus une fois le
 *   formulaire réactivé (un champ désactivé ne peut pas le recevoir).
 */
export function applyServerErrors(form, error) {
  if (!isApiError(error)) {
    form.setError('root.server', { type: 'INTERNAL_ERROR', message: 'errors.INTERNAL_ERROR' });
    return undefined;
  }
  const fieldNames = new Set(Object.keys(form.getValues()));
  /** @type {string | undefined} */
  let firstField;
  for (const issue of error.details.issues ?? []) {
    if (fieldNames.has(issue.path)) {
      const key = SERVER_ISSUE_KEYS[/** @type {keyof typeof SERVER_ISSUE_KEYS} */ (issue.code)];
      form.setError(issue.path, {
        type: SERVER_ERROR_TYPE,
        message: `form.errors.${key ?? 'invalid'}`,
      });
      firstField ??= issue.path;
    }
  }
  form.setError('root.server', { type: error.code, message: `errors.${error.code}` });
  return firstField;
}

/**
 * Texte affiché sous un champ en erreur : le message de l'erreur du schéma, déjà traduit, ou la
 * clé d'une erreur de l'API, traduite ici.
 *
 * @param {import('react-hook-form').FieldError | undefined} error
 * @param {(key: string) => string} t Traduction de l'espace de noms « ui ».
 * @returns {string | undefined}
 */
export function fieldErrorText(error, t) {
  if (!error?.message) {
    return undefined;
  }
  return error.type === SERVER_ERROR_TYPE ? t(error.message) : error.message;
}
