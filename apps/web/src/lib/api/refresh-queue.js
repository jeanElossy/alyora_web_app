/**
 * @template T
 * @typedef {(() => Promise<T>) & { settled: () => Promise<void>, isPending: () => boolean }} SingleFlight
 */

/**
 * Enveloppe une tâche asynchrone pour qu'une seule exécution soit en vol à la fois : tous les
 * appelants qui arrivent pendant qu'elle tourne attendent la même promesse, et reçoivent le
 * même résultat ou la même erreur. Une fois terminée, l'appel suivant la relance.
 *
 * C'est la file d'attente du rafraîchissement de session : 5 requêtes qui reçoivent un 401 en
 * même temps déclenchent un seul refresh.
 *
 * @template T
 * @param {() => Promise<T>} task
 * @returns {SingleFlight<T>}
 */
export function createSingleFlight(task) {
  /** @type {Promise<T> | null} */
  let pending = null;

  const run = () => {
    pending ??= Promise.resolve()
      .then(task)
      .finally(() => {
        pending = null;
      });
    return pending;
  };

  return Object.assign(run, {
    /** Se résout quand l'exécution en vol est terminée, qu'elle ait réussi ou non. */
    settled: () =>
      pending
        ? pending.then(
            () => undefined,
            () => undefined,
          )
        : Promise.resolve(),
    isPending: () => pending !== null,
  });
}
