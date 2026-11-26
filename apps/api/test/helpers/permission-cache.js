/**
 * Cache des permissions en mémoire, pour les tests qui ne portent pas sur Redis : même
 * contrat que le cache Redis (un accès accordé est gardé jusqu'à son invalidation, un refus
 * ne l'est jamais), sans expiration. Un test qui modifie un collaborateur directement en base
 * doit donc invalider, comme le fera le code de production.
 *
 * @returns {import('../../src/modules/access/services/permission-cache.js').PermissionCache & { size: () => number }}
 */
export function createMemoryPermissionCache() {
  /** @type {Map<string, import('../../src/lib/auth/require-permission.js').EventAccess>} */
  const entries = new Map();
  /** @param {{ eventId: string, userId: string }} key */
  const keyOf = ({ eventId, userId }) => `${eventId}:${userId}`;

  return {
    async get(key, load) {
      const cached = entries.get(keyOf(key));
      if (cached) {
        return cached;
      }
      const access = await load();
      if (access) {
        entries.set(keyOf(key), access);
      }
      return access;
    },
    async invalidate(keys) {
      for (const key of keys) {
        entries.delete(keyOf(key));
      }
    },
    size: () => entries.size,
  };
}
