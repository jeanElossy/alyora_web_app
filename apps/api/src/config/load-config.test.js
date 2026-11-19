import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, loadMongoUri } from './load-config.js';

const SECRET_MONGO_URI = 'mongodb+srv://admin:Sup3rS3cret@cluster0.example.net/alyora';
const SECRET_REDIS_URL = 'rediss://default:R3disS3cret@redis.example.net:6380';

/** Secrets tirés au hasard : aucune valeur connue dans le dépôt. */
const ACCESS_TOKEN_SECRET = randomBytes(32).toString('base64');
const HASH_SECRET = randomBytes(32).toString('base64');
const ENCRYPTION_KEY = randomBytes(32);

/** Un environnement de production complet. */
const PRODUCTION_ENV = Object.freeze({
  ACCESS_TOKEN_SECRET,
  HASH_SECRET,
  DATA_ENCRYPTION_KEY: ENCRYPTION_KEY.toString('base64'),
  WEB_APP_URL: 'https://app.alyora.example',
  COOKIE_DOMAIN: '.alyora.example',
  NODE_ENV: 'production',
  PORT: '8080',
  LOG_LEVEL: 'info',
  MONGODB_URI: SECRET_MONGO_URI,
  MONGODB_MAX_POOL_SIZE: '20',
  REDIS_URL: SECRET_REDIS_URL,
  CORS_ORIGINS: 'https://app.alyora.example, https://admin.alyora.example',
  TRUST_PROXY: '1',
});

/**
 * @param {Record<string, string | undefined>} env
 * @returns {ConfigError}
 */
function configErrorOf(env) {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      return error;
    }
    throw error;
  }
  throw new Error('loadConfig() was expected to throw');
}

describe('loadConfig', () => {
  it('builds the configuration from a complete production environment', () => {
    const { config, defaultsApplied } = loadConfig(PRODUCTION_ENV);

    expect(config).toEqual({
      env: 'production',
      isProduction: true,
      port: 8080,
      logLevel: 'info',
      mongo: { uri: SECRET_MONGO_URI, maxPoolSize: 20 },
      redis: { url: SECRET_REDIS_URL },
      cors: { origins: ['https://app.alyora.example', 'https://admin.alyora.example'] },
      trustProxy: 1,
      auth: {
        accessTokenSecret: ACCESS_TOKEN_SECRET,
        hashSecret: HASH_SECRET,
        dataEncryptionKey: ENCRYPTION_KEY,
        webAppUrl: 'https://app.alyora.example',
        // Le point initial, ancienne notation, est retiré.
        cookieDomain: 'alyora.example',
      },
    });
    expect(defaultsApplied).toEqual([]);
  });

  it.each([
    'NODE_ENV',
    'MONGODB_URI',
    'REDIS_URL',
    'ACCESS_TOKEN_SECRET',
    'HASH_SECRET',
    'DATA_ENCRYPTION_KEY',
  ])('refuses a missing %s, in every environment', (variable) => {
    for (const nodeEnv of ['development', 'test', 'production']) {
      const env = { ...PRODUCTION_ENV, NODE_ENV: nodeEnv, [variable]: undefined };

      expect(configErrorOf(env).issues.map((issue) => issue.variable)).toContain(variable);
    }
  });

  it.each([
    'PORT',
    'LOG_LEVEL',
    'CORS_ORIGINS',
    'TRUST_PROXY',
    'MONGODB_MAX_POOL_SIZE',
    'WEB_APP_URL',
  ])('gives no silent default for %s in production', (variable) => {
    const error = configErrorOf({ ...PRODUCTION_ENV, [variable]: undefined });

    expect(error.issues).toEqual([{ variable, message: expect.any(String) }]);
  });

  it('applies and reports the defaults of tuning variables in development', () => {
    const { config, defaultsApplied } = loadConfig({
      NODE_ENV: 'development',
      MONGODB_URI: 'mongodb://localhost:27017/alyora?replicaSet=rs0',
      REDIS_URL: 'redis://localhost:6379',
      ACCESS_TOKEN_SECRET,
      HASH_SECRET,
      DATA_ENCRYPTION_KEY: PRODUCTION_ENV.DATA_ENCRYPTION_KEY,
    });

    expect(config).toMatchObject({ port: 3000, logLevel: 'debug', trustProxy: false });
    expect(config.cors.origins).toEqual(['http://localhost:5173']);
    expect(config.auth).toMatchObject({
      webAppUrl: 'http://localhost:5173',
      cookieDomain: undefined,
    });
    expect(defaultsApplied.sort()).toEqual(
      [
        'CORS_ORIGINS',
        'LOG_LEVEL',
        'MONGODB_MAX_POOL_SIZE',
        'PORT',
        'TRUST_PROXY',
        'WEB_APP_URL',
      ].sort(),
    );
  });

  it('treats empty values as missing, like a copied .env.example', () => {
    const error = configErrorOf({ ...PRODUCTION_ENV, MONGODB_URI: '', REDIS_URL: '   ' });

    expect(error.issues.map((issue) => issue.variable).sort()).toEqual([
      'MONGODB_URI',
      'REDIS_URL',
    ]);
  });

  it.each([
    ['NODE_ENV', 'staging'],
    ['PORT', 'http'],
    ['PORT', '70000'],
    ['LOG_LEVEL', 'verbose'],
    ['MONGODB_URI', 'postgres://localhost/alyora'],
    ['MONGODB_MAX_POOL_SIZE', '0'],
    ['REDIS_URL', 'localhost:6379'],
    ['CORS_ORIGINS', '*'],
    ['CORS_ORIGINS', 'https://app.alyora.example/'],
    ['CORS_ORIGINS', 'https://app.alyora.example/login'],
    ['CORS_ORIGINS', 'ftp://files.alyora.example'],
    ['CORS_ORIGINS', ' , '],
    ['TRUST_PROXY', 'true'],
    ['ACCESS_TOKEN_SECRET', 'trop-court'],
    ['HASH_SECRET', 'a'.repeat(31)],
    ['DATA_ENCRYPTION_KEY', 'pas-du-base64'],
    ['DATA_ENCRYPTION_KEY', randomBytes(16).toString('base64')],
    ['WEB_APP_URL', 'https://app.alyora.example/connexion'],
    ['WEB_APP_URL', 'app.alyora.example'],
    ['COOKIE_DOMAIN', 'https://alyora.example'],
    ['COOKIE_DOMAIN', 'localhost'],
  ])('refuses %s=%s', (variable, value) => {
    const error = configErrorOf({ ...PRODUCTION_ENV, [variable]: value });

    expect(error.issues.map((issue) => issue.variable)).toEqual([variable]);
  });

  it('refuses the same value for ACCESS_TOKEN_SECRET and HASH_SECRET', () => {
    const error = configErrorOf({ ...PRODUCTION_ENV, HASH_SECRET: ACCESS_TOKEN_SECRET });

    expect(error.issues).toEqual([
      { variable: 'HASH_SECRET', message: 'must differ from ACCESS_TOKEN_SECRET' },
    ]);
    expect(`${error.message} ${JSON.stringify(error.issues)}`).not.toContain(ACCESS_TOKEN_SECRET);
  });

  it('accepts TRUST_PROXY=false and TRUST_PROXY=0 as "no proxy"', () => {
    expect(loadConfig({ ...PRODUCTION_ENV, TRUST_PROXY: 'false' }).config.trustProxy).toBe(false);
    expect(loadConfig({ ...PRODUCTION_ENV, TRUST_PROXY: '0' }).config.trustProxy).toBe(false);
  });

  it('never reports the value of a variable, only its name', () => {
    const error = configErrorOf({
      ...PRODUCTION_ENV,
      MONGODB_URI: 'not-a-uri-but-Sup3rS3cret',
      ACCESS_TOKEN_SECRET: 'Sup3rS3cret-but-short',
      PORT: undefined,
    });
    const reported = `${error.message} ${JSON.stringify(error.issues)}`;

    expect(reported).toContain('MONGODB_URI');
    expect(reported).toContain('PORT');
    expect(reported).not.toContain('Sup3rS3cret');
    expect(reported).not.toContain('R3disS3cret');
  });
});

describe('loadMongoUri', () => {
  it('returns MONGODB_URI alone, without requiring the other variables', () => {
    expect(loadMongoUri({ MONGODB_URI: SECRET_MONGO_URI })).toBe(SECRET_MONGO_URI);
  });

  it('refuses a missing or invalid URI without echoing it', () => {
    expect(() => loadMongoUri({})).toThrow(ConfigError);
    expect(() => loadMongoUri({ MONGODB_URI: 'Sup3rS3cret' })).toThrow(/^(?!.*Sup3rS3cret).*$/);
  });
});
