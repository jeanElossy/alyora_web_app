// Première migration, vide volontairement : elle ouvre l'historique des migrations, pour que
// tout changement ultérieur de schéma ou d'index soit appliqué par une migration et enregistré.
//
// Une migration reçoit (db, client) : `db` est la base MongoDB, `client` le MongoClient, qui
// sert à exécuter plusieurs écritures dans une transaction (client.withSession(...)).

/** @returns {Promise<void>} */
export const up = async () => {};

/** @returns {Promise<void>} */
export const down = async () => {};
