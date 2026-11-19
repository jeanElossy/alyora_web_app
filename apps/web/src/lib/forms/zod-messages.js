/**
 * Problème de validation Zod 4, tel que le reçoit la fonction de personnalisation des messages.
 *
 * @typedef {object} ZodIssueInput
 * @property {string} code
 * @property {unknown} [input]
 * @property {string} [origin] Type contrôlé : string, number, array...
 * @property {string} [format] Format attendu : email, url...
 * @property {string} [expected]
 * @property {unknown[]} [values] Valeurs acceptées (énumération, littéral).
 * @property {number | bigint} [minimum]
 * @property {number | bigint} [maximum]
 */

/**
 * Clé de traduction (espace de noms « ui », sous form.errors) et valeurs d'interpolation d'un
 * problème de validation. Les messages anglais de Zod ne sont jamais affichés.
 *
 * @param {ZodIssueInput} issue
 * @returns {{ key: string, values?: Record<string, unknown> }}
 */
export function describeIssue(issue) {
  const empty = issue.input === undefined || issue.input === null || issue.input === '';
  if (empty && issue.code !== 'invalid_value') {
    return { key: 'required' };
  }
  switch (issue.code) {
    case 'invalid_type':
      return { key: issue.expected === 'int' ? 'not_integer' : 'invalid_type' };
    case 'too_small':
      return issue.origin === 'number'
        ? { key: 'too_small_number', values: { minimum: Number(issue.minimum) } }
        : { key: 'too_small_string', values: { minimum: Number(issue.minimum) } };
    case 'too_big':
      return issue.origin === 'number'
        ? { key: 'too_big_number', values: { maximum: Number(issue.maximum) } }
        : { key: 'too_big_string', values: { maximum: Number(issue.maximum) } };
    case 'invalid_format':
      return { key: issue.format === 'email' ? 'invalid_email' : 'invalid_format' };
    case 'invalid_value':
      return {
        key:
          issue.values?.length === 1 && issue.values[0] === true ? 'must_accept' : 'invalid_value',
      };
    default:
      return { key: 'invalid' };
  }
}

/**
 * Message traduit d'un problème de validation.
 *
 * @param {ZodIssueInput} issue
 * @param {(key: string, values?: Record<string, unknown>) => string} t Traduction de l'espace
 *   de noms « ui ».
 * @returns {string}
 */
export function translateIssue(issue, t) {
  const { key, values } = describeIssue(issue);
  return t(`form.errors.${key}`, values);
}
