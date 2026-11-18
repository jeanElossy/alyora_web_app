import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testMongoUri } from '../helpers/db.js';

const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MIGRATE_MONGO = fileURLToPath(
  new URL('../../node_modules/.bin/migrate-mongo', import.meta.url),
);
const DATABASE_URI = testMongoUri('_migrations');

/**
 * Lance la vraie commande migrate-mongo, avec le vrai fichier de configuration, comme le font
 * les scripts migrate:*.
 *
 * @param {string} command
 * @param {Record<string, string>} [env]
 */
function migrateMongo(command, env = { MONGODB_URI: DATABASE_URI }) {
  return promisify(execFile)(MIGRATE_MONGO, [command], {
    cwd: API_ROOT,
    env: { PATH: process.env.PATH ?? '', ...env },
    timeout: 30_000,
  });
}

/** @type {import('mongoose').Connection} */
let connection;

beforeAll(async () => {
  connection = await mongoose.createConnection(DATABASE_URI).asPromise();
  await connection.dropDatabase();
});

afterAll(async () => {
  await connection.dropDatabase();
  await connection.close();
});

describe('migrate-mongo', () => {
  it('applies the pending migrations and records them in migrations_changelog', async () => {
    const files = (await readdir(`${API_ROOT}/migrations`))
      .filter((file) => file.endsWith('.js'))
      .sort();

    const { stdout } = await migrateMongo('up');

    for (const file of files) {
      expect(stdout).toContain(`MIGRATED UP: ${file}`);
    }
    const changelog = await connection.collection('migrations_changelog').find({}).toArray();
    expect(changelog.map((entry) => entry.fileName).sort()).toEqual(files);
  });

  it('rolls the last migration back', async () => {
    await migrateMongo('up');

    const { stdout } = await migrateMongo('down');

    expect(stdout).toContain('MIGRATED DOWN:');
    const status = await migrateMongo('status');
    expect(status.stdout).toContain('PENDING');
  });

  it('refuses to run without MONGODB_URI, naming the variable', async () => {
    const outcome = await migrateMongo('status', {}).catch(
      (/** @type {{ code: number, stderr: string, stdout: string }} */ error) => error,
    );

    expect(outcome).toMatchObject({ code: 1 });
    expect(`${outcome.stdout}${outcome.stderr}`).toContain('MONGODB_URI');
  });
});
