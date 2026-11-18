/**
 * Doublure du client ioredis pour les tests qui n'ont pas besoin d'un vrai Redis : la sonde de
 * disponibilité (ping) et le stockage du rate limit (call). Passer `available` à false pour
 * simuler un Redis injoignable.
 */
export function createFakeRedis() {
  return {
    available: true,
    /** @type {string[][]} */
    commands: [],
    async ping() {
      if (!this.available) {
        throw new Error('Redis unreachable');
      }
      return 'PONG';
    },
    /**
     * @param {string} command
     * @param {...string} args
     * @returns {Promise<unknown>}
     */
    async call(command, ...args) {
      this.commands.push([command, ...args]);
      if (!this.available) {
        throw new Error('Redis unreachable');
      }
      if (command === 'SCRIPT') {
        // SCRIPT LOAD répond avec le SHA1 du script.
        return 'a'.repeat(40);
      }
      // Le script d'incrément du rate limit répond [totalHits, millisecondesAvantExpiration].
      return command === 'EVALSHA' ? [1, 60_000] : 1;
    },
  };
}
