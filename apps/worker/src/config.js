import { z } from 'zod';

/**
 * Transports d'e-mail disponibles (voir l'ADR 0005). « brevo » envoie par l'API de Brevo : le
 * seul accepté en production. « file » écrit chaque e-mail dans un dossier local : pour le
 * développement et les tests seulement.
 */
export const EMAIL_TRANSPORTS = Object.freeze(/** @type {const} */ (['file', 'brevo']));

/** Nom d'expéditeur par défaut, dans tous les environnements : la marque. */
export const DEFAULT_MAIL_FROM_NAME = 'ALYORA';

/** Valeurs par défaut hors production seulement, annoncées au démarrage. */
const NON_PRODUCTION_DEFAULTS = Object.freeze({
  LOG_LEVEL: 'debug',
  WORKER_CONCURRENCY: '5',
  EMAIL_TRANSPORT: 'file',
  MAIL_OUTBOX_DIR: '.mail-outbox',
});

/**
 * Clé de l'API Brevo (« SMTP & API → API Keys »). Une clé SMTP (xsmtpsib-...) ne sert qu'au
 * relais SMTP, pas à l'API : elle est refusée avec un message qui le dit.
 */
const brevoApiKey = z
  .string()
  .regex(/^\S{20,}$/, 'must be a Brevo API key (xkeysib-...)')
  .refine(
    (value) => !value.startsWith('xsmtpsib-'),
    'is an SMTP key: use an API key (xkeysib-...) from SMTP & API → API Keys',
  );

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
  MAIL_OUTBOX_DIR: z.string().min(1).optional(),
  BREVO_API_KEY: brevoApiKey.optional(),
  MAIL_FROM_EMAIL: z.email('must be an e-mail address, e.g. no-reply@alyora.com').optional(),
  MAIL_FROM_NAME: z.string().min(1).max(70).default(DEFAULT_MAIL_FROM_NAME),
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
 * @property {FileEmailConfig | BrevoEmailConfig} email
 */

/** @typedef {{ transport: 'file', outboxDir: string }} FileEmailConfig */
/**
 * @typedef {object} BrevoEmailConfig
 * @property {'brevo'} transport
 * @property {string} apiKey
 * @property {{ email: string, name: string }} sender
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
  return {
    config: {
      env: values.NODE_ENV,
      logLevel: values.LOG_LEVEL,
      redisUrl: values.REDIS_URL,
      concurrency: values.WORKER_CONCURRENCY,
      dataEncryptionKey: values.DATA_ENCRYPTION_KEY,
      email: emailConfigOf(values),
    },
    defaultsApplied,
  };
}

/**
 * Réglages du transport choisi, et seulement les siens : chacun a ses variables obligatoires.
 *
 * @param {z.infer<typeof envSchema>} values
 * @returns {FileEmailConfig | BrevoEmailConfig}
 * @throws {WorkerConfigError}
 */
function emailConfigOf(values) {
  /** @type {{ variable: string, message: string }[]} */
  const issues = [];
  if (values.EMAIL_TRANSPORT === 'file') {
    const outboxDir = values.MAIL_OUTBOX_DIR;
    if (values.NODE_ENV === 'production') {
      issues.push({
        variable: 'EMAIL_TRANSPORT',
        message: 'the file transport is for development only; use brevo in production',
      });
    }
    if (!outboxDir) {
      issues.push({ variable: 'MAIL_OUTBOX_DIR', message: 'is required by the file transport' });
    }
    if (issues.length > 0 || !outboxDir) {
      throw new WorkerConfigError(issues);
    }
    return { transport: 'file', outboxDir };
  }
  const { BREVO_API_KEY: apiKey, MAIL_FROM_EMAIL: fromEmail } = values;
  if (!apiKey) {
    issues.push({ variable: 'BREVO_API_KEY', message: 'is required by the brevo transport' });
  }
  if (!fromEmail) {
    issues.push({
      variable: 'MAIL_FROM_EMAIL',
      message: 'is required by the brevo transport, e.g. no-reply@alyora.com',
    });
  }
  if (!apiKey || !fromEmail) {
    throw new WorkerConfigError(issues);
  }
  return { transport: 'brevo', apiKey, sender: { email: fromEmail, name: values.MAIL_FROM_NAME } };
}
