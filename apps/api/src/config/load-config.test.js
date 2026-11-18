import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, loadMongoUri } from './load-config.js';

const SECRET_MONGO_URI = 'mongodb+srv://admin:Sup3rS3cret@cluster0.example.net/alyora';
const SECRET_REDIS_URL = 'rediss://default:R3disS3cret@redis.example.net:6380';

/** Un environnement de production complet. */
const PRODUCTION_ENV = Object.freeze({
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
    });
    expect(defaultsApplied).toEqual([]);
  });

  it.each(['NODE_ENV', 'MONGODB_URI', 'REDIS_URL'])(
    'refuses a missing %s, in every environment',
    (variable) => {
      for (const nodeEnv of ['development', 'test', 'production']) {
        const env = { ...PRODUCTION_ENV, NODE_ENV: nodeEnv, [variable]: undefined };

        expect(configErrorOf(env).issues.map((issue) => issue.variable)).toContain(variable);
      }
    },
  );

  it.each(['PORT', 'LOG_LEVEL', 'CORS_ORIGINS', 'TRUST_PROXY', 'MONGODB_MAX_POOL_SIZE'])(
    'gives no silent default for %s in production',
    (variable) => {
      const error = configErrorOf({ ...PRODUCTION_ENV, [variable]: undefined });

      expect(error.issues).toEqual([{ variable, message: expect.any(String) }]);
    },
  );

  it('applies and reports the defaults of tuning variables in development', () => {
    const { config, defaultsApplied } = loadConfig({
      NODE_ENV: 'development',
      MONGODB_URI: 'mongodb://localhost:27017/alyora?replicaSet=rs0',
      REDIS_URL: 'redis://localhost:6379',
    });

    expect(config).toMatchObject({ port: 3000, logLevel: 'debug', trustProxy: false });
    expect(config.cors.origins).toEqual(['http://localhost:5173']);
    expect(defaultsApplied.sort()).toEqual(
      ['CORS_ORIGINS', 'LOG_LEVEL', 'MONGODB_MAX_POOL_SIZE', 'PORT', 'TRUST_PROXY'].sort(),
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
  ])('refuses %s=%s', (variable, value) => {
    const error = configErrorOf({ ...PRODUCTION_ENV, [variable]: value });

    expect(error.issues.map((issue) => issue.variable)).toEqual([variable]);
  });

  it('accepts TRUST_PROXY=false and TRUST_PROXY=0 as "no proxy"', () => {
    expect(loadConfig({ ...PRODUCTION_ENV, TRUST_PROXY: 'false' }).config.trustProxy).toBe(false);
    expect(loadConfig({ ...PRODUCTION_ENV, TRUST_PROXY: '0' }).config.trustProxy).toBe(false);
  });

  it('never reports the value of a variable, only its name', () => {
    const error = configErrorOf({
      ...PRODUCTION_ENV,
      MONGODB_URI: 'not-a-uri-but-Sup3rS3cret',
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
