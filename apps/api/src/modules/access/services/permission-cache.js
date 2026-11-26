import {
  PERMISSION_CACHE_TTL_SECONDS,
  myPermissionsResponseSchema,
  objectIdSchema,
} from '@alyora/shared';

/** @typedef {import('../../../lib/auth/require-permission.js').EventAccess} EventAccess */
/** @typedef {{ eventId: string, userId: string }} AccessKey */

/**
 * @typedef {object} PermissionCache
 * @property {(key: AccessKey, load: () => Promise<EventAccess | null>) => Promise<EventAccess | null>} get
 *   L'accès en cache, sinon `load()`, mis en cache s'il n'est pas null.
 * @property {(keys: ReadonlyArray<AccessKey>) => Promise<void>} invalidate
 */

/**
 * Durée de vie d'un numéro de version. Bien plus longue que celle d'une entrée et que toute
 * lecture MongoDB : une version ne doit pas disparaître pendant une lecture en cours.
 */
const VERSION_TTL_SECONDS = 24 * 60 * 60;

/** Format des entrées : le changer rend les anciennes illisibles, donc ignorées. */
const ENTRY_FORMAT = 'v1';

/**
 * Écrit l'entrée seulement si la version n'a pas changé depuis le début de la lecture MongoDB.
 * KEYS[1] : version ; KEYS[2] : entrée. ARGV : version lue ('' si absente), valeur, durée.
 */
const SET_IF_VERSION_UNCHANGED = `
if (redis.call('GET', KEYS[1]) or '') == ARGV[1] then
  redis.call('SET', KEYS[2], ARGV[2], 'EX', tonumber(ARGV[3]))
  return 1
end
return 0
`;

const cachedAccessSchema = myPermissionsResponseSchema.extend({
  organizationId: objectIdSchema,
  collaboratorId: objectIdSchema,
});

/**
 * Cache Redis des permissions résolues, 60 secondes, partagé par les instances de l'API.
 *
 * Une révocation ne doit jamais être annulée par une lecture lente : une requête lit MongoDB
 * avant la révocation, la révocation efface l'entrée, puis la requête réécrirait l'ancienne
 * valeur pour 60 secondes. D'où un numéro de version par (événement, compte) :
 * - l'invalidation incrémente la version et efface l'entrée, dans une transaction Redis ;
 * - la lecture note la version avant de lire MongoDB, et n'écrit l'entrée (script Lua,
 *   atomique) que si la version n'a pas bougé entre-temps.
 *
 * Seuls les accès accordés sont mis en cache : un refus (404) ne l'est pas, sinon sonder des
 * identifiants d'événement au hasard remplirait Redis.
 *
 * Redis injoignable : la lecture passe directement par MongoDB, qui fait foi. Une invalidation
 * qui échoue est journalisée en alerte critique sans faire échouer l'opération, déjà validée
 * en base : l'accès révoqué peut alors survivre jusqu'à 60 secondes (risque accepté, ADR 0006).
 *
 * @param {object} deps
 * @param {import('ioredis').Redis} deps.redis
 * @param {import('pino').Logger} deps.logger
 * @param {string} [deps.prefix] Préfixe des clés (les tests en prennent un unique).
 * @param {number} [deps.ttlSeconds]
 * @returns {PermissionCache}
 */
export function createRedisPermissionCache({
  redis,
  logger,
  prefix = 'perm',
  ttlSeconds = PERMISSION_CACHE_TTL_SECONDS,
}) {
  /** @param {AccessKey} key */
  const keysOf = ({ eventId, userId }) => {
    // Étiquette de hachage : l'entrée et sa version restent sur le même nœud d'un cluster.
    const slot = `{${eventId}:${userId}}`;
    return {
      entry: `${prefix}:${ENTRY_FORMAT}:${slot}:access`,
      version: `${prefix}:${slot}:version`,
    };
  };

  /**
   * @param {string} raw
   * @param {AccessKey} key
   * @returns {EventAccess | null}
   */
  function parse(raw, key) {
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
    const result = cachedAccessSchema.safeParse(value);
    if (!result.success || result.data.eventId !== key.eventId) {
      return null;
    }
    const { data } = result;
    return Object.freeze({
      eventId: data.eventId,
      organizationId: data.organizationId,
      collaboratorId: data.collaboratorId,
      role: Object.freeze(data.role),
      permissions: Object.freeze(data.permissions),
    });
  }

  return {
    async get(key, load) {
      const keys = keysOf(key);
      /** @type {Array<string | null>} */
      let values;
      try {
        values = await redis.mget(keys.entry, keys.version);
      } catch (error) {
        logger.warn(
          { err: error, event: 'access.permission_cache_unavailable' },
          'Permission cache unavailable: permissions resolved from MongoDB',
        );
        return load();
      }
      const [cached, version] = values;
      const hit = cached ? parse(cached, key) : null;
      if (hit) {
        return hit;
      }
      const access = await load();
      if (access) {
        try {
          await redis.eval(
            SET_IF_VERSION_UNCHANGED,
            2,
            keys.version,
            keys.entry,
            version ?? '',
            JSON.stringify(access),
            String(ttlSeconds),
          );
        } catch (error) {
          logger.warn(
            { err: error, event: 'access.permission_cache_unavailable' },
            'Permissions could not be cached',
          );
        }
      }
      return access;
    },

    async invalidate(accessKeys) {
      if (accessKeys.length === 0) {
        return;
      }
      try {
        const transaction = redis.multi();
        for (const accessKey of accessKeys) {
          const keys = keysOf(accessKey);
          transaction.incr(keys.version).expire(keys.version, VERSION_TTL_SECONDS).del(keys.entry);
        }
        const results = await transaction.exec();
        const failure = results?.find(([error]) => error)?.[0];
        if (!results || failure) {
          throw failure ?? new Error('Redis transaction aborted');
        }
      } catch (error) {
        logger.error(
          {
            err: error,
            event: 'access.permission_cache_invalidation_failed',
            severity: 'critical',
            count: accessKeys.length,
          },
          'Permission cache invalidation failed: revoked permissions may survive until expiry',
        );
      }
    },
  };
}
