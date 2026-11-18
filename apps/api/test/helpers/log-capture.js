/**
 * Destination pino en mémoire : chaque ligne JSON écrite par le logger est conservée, de façon
 * synchrone.
 */
export function createLogCapture() {
  /** @type {string[]} */
  const lines = [];
  return {
    /** @type {import('pino').DestinationStream} */
    destination: {
      write(chunk) {
        for (const line of String(chunk).split('\n')) {
          if (line) {
            lines.push(line);
          }
        }
      },
    },
    lines,
    /** @returns {Array<Record<string, any>>} Entrées de log analysées (JSON). */
    entries() {
      return lines.map((line) => JSON.parse(line));
    },
    /** @returns {string} Tout ce qui a été écrit, brut, pour y chercher des fuites. */
    text() {
      return lines.join('\n');
    },
    clear() {
      lines.length = 0;
    },
  };
}
