import { ENV_KEYS, NON_PRODUCTION_DEFAULTS, envSchema } from './env.schema.js';

/**
 * @typedef {object} AppConfig
 * @property {'development' | 'test' | 'production'} env
 * @property {boolean} isProduction
 * @property {number} port
 * @property {(typeof import('./env.schema.js').LOG_LEVELS)[number]} logLevel
 * @property {{ uri: string, maxPoolSize: number }} mongo
 * @property {{ url: string }} redis
 * @property {{ origins: string[] }} cors
 * @property {number | false} trustProxy
 */

/**
 * @typedef {object} ConfigIssue
 * @property {string} variable Nom de la variable fautive. Sa valeur n'est jamais rapportée.
 * @property {string} message
 */

/** Levée quand l'environnement est invalide. Porte les noms des variables, jamais leurs valeurs. */
export class ConfigError extends Error {
  /** @param {ConfigIssue[]} issues */
  constructor(issues) {
    const summary = issues.map((issue) => `${issue.variable} (${issue.message})`).join('; ');
    super(`Invalid environment configuration: ${summary}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/**
 * Valide l'environnement et construit la configuration de l'API.
 * Une valeur vide compte comme absente : un .env.example recopié tel quel est donc non défini.
 *
 * @param {Record<string, string | undefined>} env En général process.env.
 * @returns {{ config: AppConfig, defaultsApplied: string[] }}
 * @throws {ConfigError}
 */
export function loadConfig(env) {
  const provided = pickProvided(env, ENV_KEYS);
  const defaults = defaultsFor(provided.NODE_ENV);
  const defaultsApplied = Object.keys(defaults).filter((key) => provided[key] === undefined);

  const result = envSchema.safeParse({ ...defaults, ...provided });
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => ({
        variable: String(issue.path[0] ?? 'environment'),
        message: issue.message,
      })),
    );
  }

  const values = result.data;
  return {
    config: {
      env: values.NODE_ENV,
      isProduction: values.NODE_ENV === 'production',
      port: values.PORT,
      logLevel: values.LOG_LEVEL,
      mongo: { uri: values.MONGODB_URI, maxPoolSize: values.MONGODB_MAX_POOL_SIZE },
      redis: { url: values.REDIS_URL },
      cors: { origins: values.CORS_ORIGINS },
      trustProxy: values.TRUST_PROXY,
    },
    defaultsApplied,
  };
}

/**
 * Lit seulement MONGODB_URI, pour les outils qui n'ont pas besoin de toute la configuration
 * de l'API (migrate-mongo).
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 * @throws {ConfigError}
 */
export function loadMongoUri(env) {
  const provided = pickProvided(env, ['MONGODB_URI']);
  const result = envSchema.pick({ MONGODB_URI: true }).safeParse(provided);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => ({ variable: 'MONGODB_URI', message: issue.message })),
    );
  }
  return result.data.MONGODB_URI;
}

/**
 * @param {string | undefined} nodeEnv
 * @returns {Readonly<Record<string, string>>}
 */
function defaultsFor(nodeEnv) {
  if (nodeEnv === 'development' || nodeEnv === 'test') {
    return NON_PRODUCTION_DEFAULTS[nodeEnv];
  }
  return {};
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {ReadonlyArray<string>} keys
 * @returns {Record<string, string | undefined>}
 */
function pickProvided(env, keys) {
  /** @type {Record<string, string | undefined>} */
  const provided = {};
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      provided[key] = value;
    }
  }
  return provided;
}
