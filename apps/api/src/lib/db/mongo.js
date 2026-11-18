import mongoose from 'mongoose';

/** Délais du driver. Une première connexion qui échoue abandonne après serverSelectionTimeoutMS. */
export const MONGO_TIMEOUTS = Object.freeze({
  serverSelectionTimeoutMS: 10_000,
  connectTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
  heartbeatFrequencyMS: 10_000,
});

/** Levée quand le serveur est une instance standalone : les transactions échoueraient. */
export class ReplicaSetRequiredError extends Error {
  constructor() {
    super(
      'MongoDB is not a replica set, so transactions are unavailable. ' +
        'Locally, start mongod with --replSet rs0, then run rs.initiate() in mongosh.',
    );
    this.name = 'ReplicaSetRequiredError';
  }
}

/** @type {WeakSet<import('mongoose').Connection>} */
const watchedConnections = new WeakSet();

/**
 * Connecte la connexion Mongoose par défaut, puis refuse un serveur qui n'est pas un replica
 * set. La reconnexion après une coupure réseau est gérée par le driver ; ce module se contente
 * de la journaliser. L'URI n'est jamais journalisée : elle contient les identifiants.
 *
 * @param {object} options
 * @param {string} options.uri
 * @param {number} options.maxPoolSize
 * @param {import('pino').Logger} options.logger
 * @returns {Promise<import('mongoose').Connection>}
 * @throws {ReplicaSetRequiredError | Error}
 */
export async function connectMongo({ uri, maxPoolSize, logger }) {
  const connection = mongoose.connection;
  watchConnection(connection, logger);
  await mongoose.connect(uri, {
    ...MONGO_TIMEOUTS,
    maxPoolSize,
    minPoolSize: 0,
    retryWrites: true,
    writeConcern: { w: 'majority' },
  });
  try {
    const { setName } = await assertReplicaSet(connection);
    logger.info({ database: connection.name, replicaSet: setName }, 'MongoDB connected');
  } catch (error) {
    await mongoose.disconnect();
    throw error;
  }
  return connection;
}

/**
 * Vérifie avec la commande "hello" que le serveur appartient à un replica set (ou qu'il est un
 * routeur mongos placé devant un replica set). Accepte n'importe quelle connexion ouverte.
 *
 * @param {import('mongoose').Connection} connection
 * @returns {Promise<{ setName: string }>}
 * @throws {ReplicaSetRequiredError}
 */
export async function assertReplicaSet(connection) {
  const hello = await openDb(connection).admin().command({ hello: 1 });
  if (typeof hello.setName === 'string') {
    return { setName: hello.setName };
  }
  if (hello.msg === 'isdbgrid') {
    return { setName: 'mongos' };
  }
  throw new ReplicaSetRequiredError();
}

/**
 * Sonde de disponibilité : la connexion est ouverte et le serveur répond.
 *
 * @param {import('mongoose').Connection} connection
 * @returns {Promise<void>}
 */
export async function pingMongo(connection) {
  if (connection.readyState !== mongoose.ConnectionStates.connected) {
    throw new Error('MongoDB is not connected');
  }
  await openDb(connection).admin().ping();
}

/** Ferme la connexion par défaut et son pool. */
export async function disconnectMongo() {
  await mongoose.disconnect();
}

/**
 * @param {import('mongoose').Connection} connection
 * @returns {import('mongodb').Db}
 */
function openDb(connection) {
  const { db } = connection;
  if (!db) {
    throw new Error('MongoDB connection is not open');
  }
  return /** @type {import('mongodb').Db} */ (/** @type {unknown} */ (db));
}

/**
 * @param {import('mongoose').Connection} connection
 * @param {import('pino').Logger} logger
 */
function watchConnection(connection, logger) {
  if (watchedConnections.has(connection)) {
    return;
  }
  watchedConnections.add(connection);
  connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  // Sans écouteur, un événement "error" ferait planter le processus.
  connection.on('error', (/** @type {unknown} */ error) => {
    logger.error({ err: error }, 'MongoDB connection error');
  });
}
