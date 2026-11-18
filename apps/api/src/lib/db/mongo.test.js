import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testMongoUri } from '../../../test/helpers/db.js';
import { createTestLogger } from '../../../test/helpers/app.js';
import { MONGODB_TEST_VERSION } from '../../../test/setup/global-setup.js';
import {
  ReplicaSetRequiredError,
  assertReplicaSet,
  connectMongo,
  disconnectMongo,
  pingMongo,
} from './mongo.js';

describe('connectMongo', () => {
  it('connects to a replica set, answers the readiness ping, then disconnects', async () => {
    const { logger, logs } = createTestLogger();
    const uri = testMongoUri('_connect');

    const connection = await connectMongo({ uri, maxPoolSize: 2, logger });
    await expect(pingMongo(connection)).resolves.toBeUndefined();
    await disconnectMongo();

    await expect(pingMongo(connection)).rejects.toThrow('MongoDB is not connected');
    const connected = logs.entries().find((entry) => entry.msg === 'MongoDB connected');
    expect(connected).toMatchObject({ database: 'alyora_test_' + workerId() + '_connect' });
    expect(connected?.replicaSet).toEqual(expect.any(String));
    expect(logs.text()).not.toContain(uri);
  });

  it('fails when the server cannot be reached', async () => {
    const { logger } = createTestLogger();

    await expect(
      connectMongo({
        uri: 'mongodb://127.0.0.1:1/unreachable?serverSelectionTimeoutMS=300',
        maxPoolSize: 1,
        logger,
      }),
    ).rejects.toThrow();
    await disconnectMongo();
  });
});

describe('assertReplicaSet on a standalone server', () => {
  /** @type {MongoMemoryServer} */
  let standalone;
  /** @type {import('mongoose').Connection} */
  let connection;

  beforeAll(async () => {
    standalone = await MongoMemoryServer.create({ binary: { version: MONGODB_TEST_VERSION } });
    connection = await mongoose.createConnection(standalone.getUri()).asPromise();
  });

  afterAll(async () => {
    await connection.close();
    await standalone.stop();
  });

  it('refuses a standalone instance, with a message that explains how to fix it', async () => {
    const error = await assertReplicaSet(connection).catch((/** @type {unknown} */ e) => e);

    expect(error).toBeInstanceOf(ReplicaSetRequiredError);
    expect(String(error)).toContain('--replSet');
  });

  it('makes connectMongo fail and close the connection', async () => {
    const { logger } = createTestLogger();

    await expect(
      connectMongo({ uri: standalone.getUri(), maxPoolSize: 1, logger }),
    ).rejects.toBeInstanceOf(ReplicaSetRequiredError);
    expect(mongoose.connection.readyState).toBe(mongoose.ConnectionStates.disconnected);
  });
});

describe('assertReplicaSet on a closed connection', () => {
  it('rejects instead of crashing', async () => {
    const closed = mongoose.createConnection();

    await expect(assertReplicaSet(closed)).rejects.toThrow('MongoDB connection is not open');
  });
});

function workerId() {
  return process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? '0';
}
