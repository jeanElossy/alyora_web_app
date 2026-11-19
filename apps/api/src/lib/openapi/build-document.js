import { errorResponseSchema } from '@alyora/shared';
import { z } from 'zod';

/** @typedef {import('./registry.js').RouteDefinition} RouteDefinition */
/** @typedef {Record<string, unknown>} JsonObject */

const JSON_CONTENT = 'application/json';
const ERROR_SCHEMA_REF = '#/components/schemas/ErrorResponse';

/**
 * Construit un document OpenAPI 3.1 à partir des définitions de routes. Les schémas sont
 * convertis par l'export JSON Schema natif de Zod 4 (draft 2020-12, le dialecte d'OpenAPI 3.1).
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.version
 * @param {string} options.basePath Préfixe sous lequel les routes sont montées ("/api/v1").
 * @param {ReadonlyArray<RouteDefinition>} options.routes
 * @returns {JsonObject}
 */
export function buildOpenApiDocument({ title, version, basePath, routes }) {
  /** @type {Record<string, JsonObject>} */
  const paths = {};
  for (const route of routes) {
    const path = `${basePath}${toOpenApiPath(route.path)}`;
    paths[path] = { ...paths[path], [route.method]: toOperation(route) };
  }
  return {
    openapi: '3.1.0',
    info: { title, version },
    paths,
    components: {
      schemas: { ErrorResponse: toJsonSchema(errorResponseSchema, 'output') },
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    },
  };
}

/**
 * Les paramètres de chemin Express (":guestId") deviennent des gabarits OpenAPI ("{guestId}").
 *
 * @param {string} path
 * @returns {string}
 */
export function toOpenApiPath(path) {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/**
 * @param {RouteDefinition} route
 * @returns {JsonObject}
 */
function toOperation(route) {
  /** @type {JsonObject} */
  const operation = { summary: route.summary, responses: toResponses(route) };
  if (route.tags) {
    operation.tags = route.tags;
  }
  if (route.authenticated) {
    operation.security = [{ bearerAuth: [] }];
  }
  const parameters = [
    ...toParameters(route.request?.params, 'path'),
    ...toParameters(route.request?.query, 'query'),
  ];
  if (parameters.length > 0) {
    operation.parameters = parameters;
  }
  if (route.request?.body) {
    operation.requestBody = {
      required: true,
      content: { [JSON_CONTENT]: { schema: toJsonSchema(route.request.body, 'input') } },
    };
  }
  return operation;
}

/**
 * @param {RouteDefinition} route
 * @returns {JsonObject}
 */
function toResponses(route) {
  /** @type {JsonObject} */
  const responses = {};
  for (const [status, response] of Object.entries(route.responses)) {
    responses[status] = response.schema
      ? {
          description: response.description,
          content: { [JSON_CONTENT]: { schema: toJsonSchema(response.schema, 'output') } },
        }
      : { description: response.description };
  }
  responses.default = {
    description: 'Error, in the normalized { code, message, details } format',
    content: { [JSON_CONTENT]: { schema: { $ref: ERROR_SCHEMA_REF } } },
  };
  return responses;
}

/**
 * @param {import('zod').ZodType | undefined} schema Un schéma d'objet.
 * @param {'path' | 'query'} location
 * @returns {JsonObject[]}
 */
function toParameters(schema, location) {
  if (!schema) {
    return [];
  }
  const json = toJsonSchema(schema, 'input');
  const properties = /** @type {Record<string, unknown>} */ (json.properties ?? {});
  const required = new Set(/** @type {string[]} */ (json.required ?? []));
  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: location,
    required: location === 'path' || required.has(name),
    schema: propertySchema,
  }));
}

/**
 * @param {import('zod').ZodType} schema
 * @param {'input' | 'output'} io
 * @returns {JsonObject}
 */
function toJsonSchema(schema, io) {
  /** @type {JsonObject} */
  const json = { ...z.toJSONSchema(schema, { io, unrepresentable: 'any' }) };
  // Le dialecte est fixé une fois par le document OpenAPI 3.1, pas répété dans chaque schéma.
  delete json.$schema;
  return json;
}
