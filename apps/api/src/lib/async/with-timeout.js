/** Levée quand une opération ne se termine pas à temps. */
export class TimeoutError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Se termine comme `operation`, ou échoue avec une TimeoutError après `ms` millisecondes.
 * Le minuteur est toujours annulé : il ne garde jamais le processus en vie.
 *
 * @template T
 * @param {() => Promise<T> | T} operation Appelée immédiatement ; une exception synchrone
 *   fait échouer la promesse.
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<T>}
 */
export async function withTimeout(operation, ms, message) {
  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(message)), ms);
  });
  try {
    return await Promise.race([Promise.resolve().then(operation), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
