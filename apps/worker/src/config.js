import { z } from 'zod';

/**
 * Transports d'e-mail disponibles. « file » écrit chaque e-mail dans un dossier local : pour
 * le développement et les tests seulement. Aucun prestataire d'envoi n'est encore choisi :
 * tant qu'il ne l'est pas, le worker refuse de démarrer en production (voir l'ADR 0004).
 */
export const EMAIL_TRANSPORTS = Object.freeze(/** @type {const} */ (['file']));

/** Valeurs par défaut hors production seulement, annoncées au démarrage. */
const NON_PRODUCTION_DEFAULTS = Object.freeze({
  LOG_LEVEL: 'debug',
  WORKER_CONCURRENCY: '5',
  EMAIL_TRANSPORT: 'file',
  MAIL_OUTBOX_DIR: '.mail-outbox',
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
  REDIS_URL: z.string().regex(/^rediss?:\/\/\S+$/, 'must be a redis:// or rediss:// URL'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100),
  DATA_ENCRYPTION_KEY: z
    .string()
    .regex(/^[A-Za-z0-9+/]{43}=$/, 'must be 32 bytes encoded in base64 (openssl rand -base64 32)')
    .transform((value) => Buffer.from(value, 'base64')),
  EMAIL_TRANSPORT: z.enum(EMAIL_TRANSPORTS),
  MAIL_OUTBOX_DIR: z.string().min(1),
});

const KEYS = /** @type {ReadonlyArray<keyof z.input<typeof envSchema>>} */ (
  Object.keys(envSchema.shape)
);

/**
 * @typedef {object} WorkerConfig
 * @property {'development' | 'test' | 'production'} env
 * @property {z.infer<typeof envSchema>['LOG_LEVEL']} logLevel
 * @property {string} redisUrl
 * @property {number} concurrency
 * @property {Buffer} dataEncryptionKey
 * @property {{ transport: 'file', outboxDir: string }} email
 */

/** Levée quand l'environnement est invalide : les noms des variables, jamais leurs valeurs. */
export class WorkerConfigError extends Error {
  /** @param {{ variable: string, message: string }[]} issues */
  constructor(issues) {
    super(`Invalid environment configuration: ${issues.map((i) => i.variable).join(', ')}`);
    this.name = 'WorkerConfigError';
    this.issues = issues;
  }
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ config: WorkerConfig, defaultsApplied: string[] }}
 * @throws {WorkerConfigError}
 */
export function loadWorkerConfig(env) {
  /** @type {Record<string, string>} */
  const provided = {};
  for (const key of KEYS) {
    const value = env[key]?.trim();
    if (value) {
      provided[key] = value;
    }
  }
  const defaults = provided.NODE_ENV === 'production' ? {} : NON_PRODUCTION_DEFAULTS;
  const defaultsApplied = Object.keys(defaults).filter((key) => provided[key] === undefined);
  const result = envSchema.safeParse({ ...defaults, ...provided });
  if (!result.success) {
    throw new WorkerConfigError(
      result.error.issues.map((issue) => ({
        variable: String(issue.path[0] ?? 'environment'),
        message: issue.message,
      })),
    );
  }
  const values = result.data;
  if (values.NODE_ENV === 'production' && values.EMAIL_TRANSPORT === 'file') {
    throw new WorkerConfigError([
      {
        variable: 'EMAIL_TRANSPORT',
        message: 'the file transport is for development only; no e-mail provider is set up yet',
      },
    ]);
  }
  return {
    config: {
      env: values.NODE_ENV,
      logLevel: values.LOG_LEVEL,
      redisUrl: values.REDIS_URL,
      concurrency: values.WORKER_CONCURRENCY,
      dataEncryptionKey: values.DATA_ENCRYPTION_KEY,
      email: { transport: values.EMAIL_TRANSPORT, outboxDir: values.MAIL_OUTBOX_DIR },
    },
    defaultsApplied,
  };
}
