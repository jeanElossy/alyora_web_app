import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useAccessDatabase } from '../../../test/helpers/access.js';
import { createTestClock } from '../../../test/helpers/auth.js';
import { TEST_SECRETS } from '../../../test/helpers/app.js';
import { createServiceContext, withSession } from '../context/service-context.js';
import { createKeyedHasher } from '../crypto/keyed-hash.js';
import { withTransaction } from '../db/transaction.js';
import { createAuditLog } from './audit-log.js';
import { AuditLog } from './audit-log.model.js';

useAccessDatabase();

const keyedHasher = createKeyedHasher(TEST_SECRETS.HASH_SECRET);
const clock = createTestClock();
const auditLog = createAuditLog({ keyedHasher, clock });

const ids = () => ({
  userId: new mongoose.Types.ObjectId().toString(),
  eventId: new mongoose.Types.ObjectId().toString(),
  organizationId: new mongoose.Types.ObjectId().toString(),
  targetId: new mongoose.Types.ObjectId().toString(),
});

/** @param {ReturnType<typeof ids>} values */
const contextOf = ({ userId, eventId, organizationId }) =>
  createServiceContext({
    userId,
    eventId,
    organizationId,
    ip: '203.0.113.7',
    userAgent: `Mozilla/5.0 ${'x'.repeat(600)}`,
  });

describe('audit log service', () => {
  it('records the actor, the target, the snapshots, an IP fingerprint and a truncated user agent', async () => {
    const values = ids();

    await withTransaction((session) =>
      auditLog.record(withSession(contextOf(values), session), {
        action: 'collaborator.permissions_changed',
        targetType: 'collaborator',
        targetId: values.targetId,
        before: { roleKey: 'reader' },
        after: { roleKey: 'editor', customRoleId: new mongoose.Types.ObjectId() },
      }),
    );

    const [entry] = await AuditLog.find({ organizationId: values.organizationId }).lean();
    expect(entry).toMatchObject({
      eventId: new mongoose.Types.ObjectId(values.eventId),
      actorId: new mongoose.Types.ObjectId(values.userId),
      action: 'collaborator.permissions_changed',
      targetType: 'collaborator',
      before: { roleKey: 'reader' },
      after: { roleKey: 'editor' },
      ipHash: keyedHasher.digest('ip', '203.0.113.7'),
      createdAt: clock.now(),
    });
    expect(entry?.userAgent).toHaveLength(512);
    expect(JSON.stringify(entry)).not.toContain('203.0.113.7');
  });

  it('writes the entry with the audited change: a rolled back transaction leaves no trace', async () => {
    const values = ids();

    await expect(
      withTransaction(async (session) => {
        await auditLog.record(withSession(contextOf(values), session), {
          action: 'collaborator.revoked',
          targetType: 'collaborator',
          targetId: values.targetId,
        });
        throw new Error('the change failed');
      }),
    ).rejects.toThrow('the change failed');

    expect(await AuditLog.countDocuments({ organizationId: values.organizationId })).toBe(0);
  });

  it('accepts an organization-level entry without event', async () => {
    const values = ids();

    await withTransaction((session) =>
      auditLog.record(withSession(contextOf(values), session), {
        action: 'custom_role.created',
        targetType: 'custom_role',
        targetId: values.targetId,
        eventId: null,
      }),
    );

    expect(await AuditLog.findOne({ organizationId: values.organizationId }).lean()).toMatchObject({
      eventId: null,
      before: null,
      after: null,
    });
  });

  it('refuses to write outside a transaction, or without organization', async () => {
    const values = ids();
    const entry = /** @type {const} */ ({
      action: 'collaborator.revoked',
      targetType: 'collaborator',
      targetId: values.targetId,
    });

    await expect(auditLog.record(contextOf(values), entry)).rejects.toThrow(/transaction/);
    await expect(
      withTransaction((session) =>
        auditLog.record(
          withSession(createServiceContext({ userId: values.userId }), session),
          entry,
        ),
      ),
    ).rejects.toThrow(/organizationId/);
  });

  it('refuses snapshots that carry a secret or a personal detail, at any depth', async () => {
    const values = ids();
    for (const after of [
      { token: 'x' },
      { invitation: { email: 'awa@exemple.ci' } },
      { list: [{ phone: '+2250700000000' }] },
      { a: { b: { c: { d: { e: { f: 1 } } } } } },
    ]) {
      await expect(
        withTransaction((session) =>
          auditLog.record(withSession(contextOf(values), session), {
            action: 'invitation.created',
            targetType: 'invitation',
            targetId: values.targetId,
            after,
          }),
        ),
        JSON.stringify(after),
      ).rejects.toThrow(/sensitive|too deep/);
    }
    expect(await AuditLog.countDocuments({ organizationId: values.organizationId })).toBe(0);
  });
});

describe('audit_logs is append-only', () => {
  it('refuses any update, replacement or deletion, even scoped', async () => {
    const values = ids();
    await withTransaction((session) =>
      auditLog.record(withSession(contextOf(values), session), {
        action: 'ownership.transferred',
        targetType: 'event',
        targetId: values.eventId,
      }),
    );
    const scope = { organizationId: values.organizationId };
    const refused = { name: 'AppendOnlyViolationError' };

    await expect(
      AuditLog.updateOne(scope, { action: 'collaborator.revoked' }).exec(),
    ).rejects.toMatchObject(refused);
    await expect(AuditLog.updateMany(scope, { actorId: null }).exec()).rejects.toMatchObject(
      refused,
    );
    await expect(AuditLog.replaceOne(scope, {}).exec()).rejects.toMatchObject(refused);
    await expect(AuditLog.deleteOne(scope).exec()).rejects.toMatchObject(refused);
    await expect(AuditLog.deleteMany(scope).exec()).rejects.toMatchObject(refused);
    await expect(AuditLog.findOneAndUpdate(scope, { actorId: null }).exec()).rejects.toMatchObject(
      refused,
    );
    await expect(AuditLog.findOneAndDelete(scope).exec()).rejects.toMatchObject(refused);
    await expect(AuditLog.findOneAndReplace(scope, {}).exec()).rejects.toMatchObject(refused);
    await expect(AuditLog.bulkWrite([{ deleteOne: { filter: scope } }])).rejects.toMatchObject(
      refused,
    );
    const entry = await AuditLog.findOne(scope);
    if (!entry) {
      throw new Error('missing entry');
    }
    entry.set('actorId', null);
    await expect(entry.save()).rejects.toMatchObject(refused);

    expect(await AuditLog.findOne(scope).lean()).toMatchObject({
      action: 'ownership.transferred',
      actorId: new mongoose.Types.ObjectId(values.userId),
    });
  });
});
