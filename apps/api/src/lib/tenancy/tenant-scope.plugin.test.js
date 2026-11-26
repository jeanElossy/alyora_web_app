import mongoose from 'mongoose';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestLogger } from '../../../test/helpers/app.js';
import { useTestDatabase } from '../../../test/helpers/db.js';
import { expectUnscopedQueriesRefused } from '../../../test/helpers/tenant-scope-assertions.js';
import { configureTenancyGuard } from './tenancy-guard.js';
import { tenantKeysOf, tenantScoped } from './tenant-scope.plugin.js';

useTestDatabase();

const scopedSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, required: true },
    label: { type: String, required: true },
  },
  { collection: 'tenancy_plugin_items', timestamps: true, strict: 'throw' },
);
scopedSchema.plugin(tenantScoped, { keys: ['eventId'] });
const Item = mongoose.model('TenancyPluginItem', scopedSchema);

/** @type {Array<() => void>} */
const restores = [];
afterEach(() => {
  restores.splice(0).forEach((restore) => restore());
});

describe('tenant scope plugin', () => {
  it('refuses every query without a tenant filter, in every form, and lets scoped ones run', async () => {
    await expectUnscopedQueriesRefused(Item);
  });

  it('runs scoped reads, updates, deletes, aggregates and bulk writes normally', async () => {
    const eventId = new mongoose.Types.ObjectId();
    const otherEventId = new mongoose.Types.ObjectId();
    await Item.create([
      { eventId, label: 'a' },
      { eventId: otherEventId, label: 'b' },
    ]);

    await Item.updateMany({ eventId }, { label: 'a2' });
    await Item.bulkWrite([
      { insertOne: { document: { eventId, label: 'c' } } },
      { deleteOne: { filter: { eventId, label: 'a2' } } },
    ]);

    expect(await Item.find({ eventId }).distinct('label')).toEqual(['c']);
    expect(await Item.countDocuments({ eventId: otherEventId })).toBe(1);
    const grouped = await Item.aggregate([
      { $match: { eventId: { $in: [eventId, otherEventId] } } },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]);
    expect(grouped).toEqual([{ _id: null, count: 2 }]);
  });

  it('saves a document read through a scoped query, but refuses its _id-only shortcuts', async () => {
    const eventId = new mongoose.Types.ObjectId();
    await Item.create({ eventId, label: 'a' });
    const item = await Item.findOne({ eventId });
    if (!item) {
      throw new Error('missing item');
    }

    item.label = 'renamed';
    await item.save();

    expect((await Item.findOne({ eventId }).lean())?.label).toBe('renamed');
    await expect(item.updateOne({ label: 'x' }).exec()).rejects.toMatchObject({
      name: 'UnscopedQueryError',
    });
    await expect(item.deleteOne()).rejects.toMatchObject({ name: 'UnscopedQueryError' });
    expect(await Item.countDocuments({ eventId })).toBe(1);
  });

  it('raises a critical alert naming the model, the operation and the filter keys, never their values', async () => {
    const { logger, logs } = createTestLogger();
    restores.push(configureTenancyGuard({ logger }));

    await expect(
      Item.find({ label: 'secret-label', eventId: undefined }).exec(),
    ).rejects.toMatchObject({
      name: 'UnscopedQueryError',
      model: 'TenancyPluginItem',
      operation: 'find',
    });

    expect(logs.entries()).toContainEqual(
      expect.objectContaining({
        level: 'error',
        event: 'tenancy.unscoped_query',
        severity: 'critical',
        model: 'TenancyPluginItem',
        operation: 'find',
        filterKeys: ['label', 'eventId'],
      }),
    );
    expect(logs.text()).not.toContain('secret-label');
  });

  it('still refuses the query when no alert logger is configured', async () => {
    restores.push(configureTenancyGuard({ logger: null }));

    await expect(Item.findOne({}).exec()).rejects.toMatchObject({ name: 'UnscopedQueryError' });
  });

  it('records the tenant keys of a scoped schema, and requires at least one', () => {
    expect(tenantKeysOf(scopedSchema)).toEqual(['eventId']);
    expect(tenantKeysOf(new mongoose.Schema({}))).toBeUndefined();
    expect(() => new mongoose.Schema({}).plugin(tenantScoped, { keys: [] })).toThrow(TypeError);
  });
});
