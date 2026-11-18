import { z } from 'zod';

export const NODE_ENVS = /** @type {const} */ (['development', 'test', 'production']);

export const LOG_LEVELS = /** @type {const} */ ([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

/**
 * Valeurs par défaut des variables de réglage, appliquées hors production seulement (et
 * annoncées au démarrage). NODE_ENV, MONGODB_URI et REDIS_URL n'en ont jamais, dans aucun
 * environnement.
 */
export const NON_PRODUCTION_DEFAULTS = Object.freeze({
  development: Object.freeze({
    PORT: '3000',
    LOG_LEVEL: 'debug',
    CORS_ORIGINS: 'http://localhost:5173',
    TRUST_PROXY: 'false',
    MONGODB_MAX_POOL_SIZE: '10',
  }),
  test: Object.freeze({
    PORT: '3000',
    LOG_LEVEL: 'silent',
    CORS_ORIGINS: 'http://localhost:5173',
    TRUST_PROXY: 'false',
    MONGODB_MAX_POOL_SIZE: '5',
  }),
});

/**
 * Liste d'origines navigateur séparées par des virgules ("https://app.example.com"), chacune
 * étant une origine exacte : schéma, hôte et port éventuel, sans chemin ni barre finale.
 */
const corsOrigins = z.string().transform((value, ctx) => {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'must list at least one origin' });
    return z.NEVER;
  }
  for (const origin of origins) {
    if (!isExactOrigin(origin)) {
      ctx.addIssue({
        code: 'custom',
        message: 'each entry must be an http(s) origin without path, e.g. https://app.example.com',
      });
      return z.NEVER;
    }
  }
  return origins;
});

/**
 * Réglage « trust proxy » d'Express : un nombre de proxys inverses ("1" derrière un load
 * balancer), ou "false" quand l'API est atteinte directement. "true" (tout faire confiance)
 * est refusé : n'importe quel client pourrait alors usurper son IP et contourner le rate
 * limiting.
 */
const trustProxy = z
  .string()
  .regex(/^(false|\d{1,2})$/, 'must be "false" or a number of proxy hops (e.g. 1)')
  .transform((value) => (value === 'false' || value === '0' ? false : Number(value)));

export const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS),
  PORT: z.coerce.number().int().min(1).max(65535),
  LOG_LEVEL: z.enum(LOG_LEVELS),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\/\S+$/, 'must be a mongodb:// or mongodb+srv:// URI'),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(500),
  REDIS_URL: z.string().regex(/^rediss?:\/\/\S+$/, 'must be a redis:// or rediss:// URL'),
  CORS_ORIGINS: corsOrigins,
  TRUST_PROXY: trustProxy,
});

/** Noms des variables lues par l'API. */
export const ENV_KEYS = /** @type {ReadonlyArray<keyof z.input<typeof envSchema>>} */ (
  Object.keys(envSchema.shape)
);

/**
 * @param {string} value
 * @returns {boolean}
 */
function isExactOrigin(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}
