import mongoose from 'mongoose';

/**
 * Exécute `work` dans une transaction MongoDB (lecture « snapshot », écriture « majority »).
 * Le driver la rejoue en entier sur un conflit transitoire (TransientTransactionError) et
 * réessaie la validation si son issue est incertaine (UnknownTransactionCommitResult).
 *
 * `work` peut donc s'exécuter plusieurs fois : il ne doit avoir aucun effet hors de la base
 * (pas d'e-mail, pas de file d'attente). Ces effets se font après, sur le résultat renvoyé.
 *
 * @template T
 * @param {(session: import('mongoose').ClientSession) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    /** @type {{ value: T } | undefined} */
    let outcome;
    await session.withTransaction(
      async () => {
        outcome = { value: await work(session) };
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
    if (!outcome) {
      throw new Error('withTransaction(): the transaction ended without running its work');
    }
    return outcome.value;
  } finally {
    await session.endSession();
  }
}

/**
 * Vrai pour une violation d'index unique (E11000). Seul le code est lu : le message de
 * l'erreur contient la valeur en double (une adresse e-mail, par exemple) et ne doit jamais
 * être journalisé ni renvoyé.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isDuplicateKeyError(error) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
