import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  findUnscopedBulkOperation,
  hasTenantScope,
  isConcreteTenantValue,
  pipelineHasTenantScope,
} from './tenant-filter.js';

const ID = new mongoose.Types.ObjectId();
const KEYS = ['eventId'];

describe('isConcreteTenantValue', () => {
  it('accepts an ObjectId, its hexadecimal form, $eq and a non-empty $in of ids', () => {
    expect(isConcreteTenantValue(ID)).toBe(true);
    expect(isConcreteTenantValue(ID.toString())).toBe(true);
    expect(isConcreteTenantValue({ $eq: ID })).toBe(true);
    expect(isConcreteTenantValue({ $in: [ID, ID.toString()] })).toBe(true);
  });

  it('refuses anything that does not name a tenant', () => {
    for (const value of [
      undefined,
      null,
      '',
      'not-an-id',
      42,
      true,
      [ID],
      {},
      { $exists: true },
      { $ne: ID },
      { $nin: [ID] },
      { $in: [] },
      { $in: [ID, null] },
      { $in: ID },
      { $eq: null },
      { $eq: ID, $ne: ID },
      { $regex: '.*' },
    ]) {
      expect(isConcreteTenantValue(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe('hasTenantScope', () => {
  it('accepts a tenant key at the top level or in a top-level $and clause', () => {
    expect(hasTenantScope({ eventId: ID }, KEYS)).toBe(true);
    expect(hasTenantScope({ eventId: ID, $or: [{ a: 1 }, { b: 2 }] }, KEYS)).toBe(true);
    expect(hasTenantScope({ $and: [{ status: 'active' }, { eventId: ID }] }, KEYS)).toBe(true);
    expect(hasTenantScope({ organizationId: ID }, ['eventId', 'organizationId'])).toBe(true);
  });

  it('refuses a filter whose tenant key is missing, empty or only in one branch of a $or', () => {
    for (const filter of [
      undefined,
      null,
      {},
      [],
      { eventId: undefined },
      { eventId: null },
      { _id: ID },
      { $or: [{ eventId: ID }, { _id: ID }] },
      { $and: [{ _id: ID }] },
      { $and: 'eventId' },
      { $nor: [{ eventId: ID }] },
    ]) {
      expect(hasTenantScope(filter, KEYS), JSON.stringify(filter)).toBe(false);
    }
  });

  it('ignores a tenant key inherited from the prototype', () => {
    const filter = Object.create({ eventId: ID });

    expect(hasTenantScope(filter, KEYS)).toBe(false);
  });
});

describe('pipelineHasTenantScope', () => {
  it('requires a scoped $match as the first stage', () => {
    expect(pipelineHasTenantScope([{ $match: { eventId: ID } }, { $sort: { _id: 1 } }], KEYS)).toBe(
      true,
    );
    expect(pipelineHasTenantScope([], KEYS)).toBe(false);
    expect(pipelineHasTenantScope([{ $match: {} }], KEYS)).toBe(false);
    expect(pipelineHasTenantScope([{ $sort: { _id: 1 } }, { $match: { eventId: ID } }], KEYS)).toBe(
      false,
    );
    expect(pipelineHasTenantScope([null], KEYS)).toBe(false);
  });
});

describe('findUnscopedBulkOperation', () => {
  it('accepts inserts and scoped filters, names the first unscoped operation', () => {
    expect(
      findUnscopedBulkOperation(
        [
          { insertOne: { document: { eventId: ID } } },
          { updateOne: { filter: { eventId: ID }, update: {} } },
          { deleteMany: { filter: { eventId: ID } } },
        ],
        KEYS,
      ),
    ).toBeNull();
    expect(
      findUnscopedBulkOperation(
        [{ insertOne: { document: {} } }, { replaceOne: { filter: { _id: ID } } }],
        KEYS,
      ),
    ).toBe('replaceOne');
    expect(findUnscopedBulkOperation([{ updateMany: {} }], KEYS)).toBe('updateMany');
    expect(findUnscopedBulkOperation([null], KEYS)).toBe('unknown');
  });
});
