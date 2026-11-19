import { validate } from '../http/validate.js';

/** @typedef {'get' | 'post' | 'put' | 'patch' | 'delete'} HttpMethod */

/**
 * @typedef {object} RouteResponse
 * @property {string} description
 * @property {import('zod').ZodType} [schema] Schéma du corps de réponse (de @alyora/shared).
 */

/**
 * @typedef {object} RouteRequest
 * @property {import('zod').ZodType} [body]
 * @property {import('zod').ZodType} [query]
 * @property {import('zod').ZodType} [params]
 */

/**
 * Description unique d'une route, qui sert à la fois à la monter (avec ses validateurs) et à
 * la documenter : le document OpenAPI ne peut pas s'écarter du code.
 *
 * @typedef {object} RouteDefinition
 * @property {HttpMethod} method
 * @property {string} path Chemin Express, relatif au routeur ("/guests/:guestId").
 * @property {string} summary
 * @property {string[]} [tags]
 * @property {RouteRequest} [request]
 * @property {Record<number, RouteResponse>} responses Réponses en cas de succès. Les réponses
 *   d'erreur sont toujours documentées avec le format d'erreur partagé.
 * @property {import('express').RequestHandler[]} [before] Protections qui passent avant la
 *   validation, sans lire le corps : CSRF, limites par IP.
 * @property {import('express').RequestHandler[]} [after] Gardes qui suivent la validation,
 *   dans cet ordre : authentification, permission, limites qui lisent le corps validé,
 *   idempotence.
 * @property {boolean} [authenticated] La route exige un access token (documentation).
 * @property {import('express').RequestHandler} handler Controller.
 */

const REQUEST_SOURCES = /** @type {const} */ (['params', 'query', 'body']);

/**
 * @param {RouteDefinition} definition
 * @returns {Readonly<RouteDefinition>}
 */
export function defineRoute(definition) {
  return Object.freeze(definition);
}

/**
 * Monte des routes sur un routeur, dans l'ordre : protections (`before`), validateurs
 * (params, query, body), gardes (`after` : auth, permission...), puis le controller.
 *
 * @param {import('express').Router} router
 * @param {ReadonlyArray<RouteDefinition>} routes
 */
export function mountRoutes(router, routes) {
  for (const route of routes) {
    /** @type {import('express').RequestHandler[]} */
    const validators = [];
    for (const source of REQUEST_SOURCES) {
      const schema = route.request?.[source];
      if (schema) {
        validators.push(validate(schema, source));
      }
    }
    router
      .route(route.path)
      [route.method](...(route.before ?? []), ...validators, ...(route.after ?? []), route.handler);
  }
}
