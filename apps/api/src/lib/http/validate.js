import { AppError } from '../errors/app-error.js';

/** @typedef {'body' | 'query' | 'params'} RequestSource */

const SOURCES = /** @type {const} */ (['body', 'query', 'params']);

/**
 * Valeurs validées, par requête. Gardées hors de `req` parce qu'Express 5 expose `req.query`
 * en lecture seule, et parce que checkJs ne peut pas étendre le type Request d'Express.
 *
 * @type {WeakMap<object, Partial<Record<RequestSource, unknown>>>}
 */
const validatedByRequest = new WeakMap();

/**
 * Middleware de validation : analyse `req[source]` avec un schéma Zod (en général un schéma
 * de @alyora/shared). En cas de succès, la valeur analysée (convertie, valeurs par défaut
 * appliquées, clés inconnues retirées par le schéma) est disponible via getValidated(). En cas
 * d'échec, la requête se termine par VALIDATION_ERROR et la liste des champs invalides, sans
 * les valeurs reçues.
 *
 * @param {import('zod').ZodType} schema
 * @param {RequestSource} source
 * @returns {import('express').RequestHandler}
 */
export function validate(schema, source) {
  if (!SOURCES.includes(source)) {
    throw new TypeError(`validate(): unknown request source "${String(source)}"`);
  }
  return async (req, _res, next) => {
    const result = await schema.safeParseAsync(req[source]);
    if (!result.success) {
      throw new AppError('VALIDATION_ERROR', {
        message: `Invalid request ${source}`,
        details: { issues: toIssues(result.error) },
      });
    }
    validatedByRequest.set(req, { ...validatedByRequest.get(req), [source]: result.data });
    next();
  };
}

/**
 * Renvoie la valeur validée par validate(schema, source) pour cette requête. Les controllers
 * lisent leurs entrées ici, jamais directement dans req.body, req.query ou req.params.
 *
 * @param {import('express').Request} req
 * @param {RequestSource} source
 * @returns {unknown}
 * @throws {Error} Si aucun validateur n'a tourné pour cette source : une erreur de programmation.
 */
export function getValidated(req, source) {
  const values = validatedByRequest.get(req);
  if (!values || !(source in values)) {
    throw new Error(`getValidated(): no validator ran for request ${source}`);
  }
  return values[source];
}

/**
 * Convertit les problèmes Zod au format d'erreur partagé. Par défaut, Zod 4 ne recopie pas
 * l'entrée dans ses problèmes ; de toute façon, seuls le chemin, le code et le message sont
 * gardés.
 *
 * @param {import('zod').ZodError} error
 * @returns {import('@alyora/shared/schemas').ErrorIssue[]}
 */
export function toIssues(error) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    code: issue.code,
    message: issue.message,
  }));
}
