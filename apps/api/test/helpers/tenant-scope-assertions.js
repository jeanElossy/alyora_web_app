import mongoose from 'mongoose';
import { expect } from 'vitest';
import { tenantKeysOf } from '../../src/lib/tenancy/tenant-scope.plugin.js';

const REFUSED = { name: 'UnscopedQueryError' };

/**
 * Filtres qui ne désignent pas un locataire précis, pour la clé `key` : tous doivent être
 * refusés.
 *
 * @param {string} key
 */
export function unscopedFilters(key) {
  const id = new mongoose.Types.ObjectId();
  return [
    {},
    { [key]: undefined },
    { [key]: null },
    { [key]: { $exists: true } },
    { [key]: { $ne: id } },
    { [key]: { $nin: [id] } },
    { [key]: { $in: [] } },
    { [key]: { $in: [id, null] } },
    { [key]: { $eq: id, $ne: id } },
    { $or: [{ [key]: id }, {}] },
    { $and: [{}] },
    { [`${key}Other`]: id },
  ];
}

/**
 * Chaque opération de lecture, de modification et de suppression du modèle, avec ce filtre.
 *
 * @param {import('mongoose').Model<any>} Model
 * @param {Record<string, unknown>} filter
 */
function filteredOperations(Model, filter) {
  const update = { $currentDate: { updatedAt: true } };
  return {
    find: () => Model.find(filter).exec(),
    findOne: () => Model.findOne(filter).exec(),
    countDocuments: () => Model.countDocuments(filter).exec(),
    distinct: () => Model.distinct('_id', filter).exec(),
    updateOne: () => Model.updateOne(filter, update).exec(),
    updateMany: () => Model.updateMany(filter, update).exec(),
    replaceOne: () => Model.replaceOne(filter, {}).exec(),
    deleteOne: () => Model.deleteOne(filter).exec(),
    deleteMany: () => Model.deleteMany(filter).exec(),
    findOneAndUpdate: () => Model.findOneAndUpdate(filter, update).exec(),
    findOneAndReplace: () => Model.findOneAndReplace(filter, {}).exec(),
    findOneAndDelete: () => Model.findOneAndDelete(filter).exec(),
  };
}

/**
 * Une requête sans filtre de cloisonnement lève une erreur (UnscopedQueryError), pour chaque
 * opération du modèle et chaque forme de filtre trompeuse ; une requête cloisonnée par chacune
 * des clés du modèle passe (contrôle).
 *
 * @param {import('mongoose').Model<any>} Model
 */
export async function expectUnscopedQueriesRefused(Model) {
  const keys = tenantKeysOf(Model.schema);
  expect(keys, `${Model.modelName} carries the tenant scope plugin`).toBeDefined();
  const [key] = /** @type {ReadonlyArray<string>} */ (keys);
  const id = new mongoose.Types.ObjectId();

  for (const filter of unscopedFilters(key)) {
    for (const [name, run] of Object.entries(filteredOperations(Model, filter))) {
      await expect(
        run(),
        `${Model.modelName}.${name}(${JSON.stringify(filter)})`,
      ).rejects.toMatchObject(REFUSED);
    }
  }

  // Pour la racine d'un locataire (clé _id), filtrer par _id est justement le cloisonnement.
  const rootOfTenant = keys?.includes('_id');
  const byIdOnly = rootOfTenant
    ? {}
    : {
        findById: () => Model.findById(id).exec(),
        'bulkWrite(updateOne by _id)': () =>
          Model.bulkWrite([{ updateOne: { filter: { _id: id }, update: { $set: {} } } }]),
      };
  const others = {
    ...byIdOnly,
    estimatedDocumentCount: () => Model.estimatedDocumentCount().exec(),
    'aggregate([])': () => Model.aggregate([]).exec(),
    'aggregate(unscoped $match)': () => Model.aggregate([{ $match: {} }]).exec(),
    'aggregate($match not first)': () =>
      Model.aggregate([{ $sort: { _id: 1 } }, { $match: { [key]: id } }]).exec(),
    'bulkWrite(deleteMany)': () => Model.bulkWrite([{ deleteMany: { filter: {} } }]),
  };
  for (const [name, run] of Object.entries(others)) {
    await expect(run(), `${Model.modelName}.${name}`).rejects.toMatchObject(REFUSED);
  }

  for (const tenantKey of /** @type {ReadonlyArray<string>} */ (keys)) {
    const scoped = { [tenantKey]: id };
    await expect(
      Model.find(scoped).exec(),
      `${Model.modelName} scoped by ${tenantKey}`,
    ).resolves.toEqual([]);
    await expect(Model.countDocuments({ $and: [scoped, {}] }).exec()).resolves.toBe(0);
    await expect(Model.find({ [tenantKey]: { $in: [id] } }).exec()).resolves.toEqual([]);
    await expect(Model.aggregate([{ $match: scoped }]).exec()).resolves.toEqual([]);
  }
}
