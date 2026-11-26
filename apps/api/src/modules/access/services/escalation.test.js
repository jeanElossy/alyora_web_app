import { PERMISSIONS, permissionsOfRole } from '@alyora/shared';
import { describe, expect, it } from 'vitest';
import { assertCanGrant, assertCanManage, loadActor } from './escalation.js';

/**
 * @param {import('@alyora/shared').RoleKey} key
 * @param {string} [userId]
 */
const holder = (key, userId = key) => ({
  userId,
  role: { type: 'predefined', key },
  permissions: permissionsOfRole(key),
});

describe('assertCanGrant (escalation rule)', () => {
  it('lets a collaborator grant a subset of their permissions, or exactly them', () => {
    const editor = holder('editor');

    expect(() => assertCanGrant(editor, holder('reader'))).not.toThrow();
    expect(() => assertCanGrant(editor, holder('editor'))).not.toThrow();
    expect(() =>
      assertCanGrant(editor, { role: { type: 'explicit' }, permissions: ['guests:read'] }),
    ).not.toThrow();
  });

  it('refuses any permission the granter does not hold, naming the missing ones', () => {
    const editor = holder('editor');

    expect(() => assertCanGrant(editor, holder('admin'))).toThrow(
      expect.objectContaining({ code: 'PERMISSION_ESCALATION', httpStatus: 403 }),
    );
    try {
      assertCanGrant(editor, {
        role: { type: 'explicit' },
        permissions: ['guests:read', 'contributions:read', 'payouts:manage'],
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'PERMISSION_ESCALATION',
        details: {
          issues: [
            {
              path: 'role',
              code: 'permission_escalation',
              message: 'Permissions not held: contributions:read, payouts:manage',
            },
          ],
        },
      });
    }
  });

  it('never grants the owner role, not even by the owner', () => {
    expect(() =>
      assertCanGrant(holder('owner'), {
        role: { type: 'predefined', key: 'owner' },
        permissions: [...PERMISSIONS],
      }),
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_ESCALATION' }));
  });
});

describe('assertCanManage', () => {
  it('lets a collaborator change one who holds no more than they do', () => {
    expect(() => assertCanManage(holder('admin'), holder('editor'))).not.toThrow();
    expect(() => assertCanManage(holder('admin'), holder('admin', 'another admin'))).not.toThrow();
  });

  it('refuses to change oneself, the owner, or anyone holding more', () => {
    expect(() => assertCanManage(holder('admin'), holder('admin'))).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
    expect(() => assertCanManage(holder('admin'), holder('owner'))).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
    // Même avec toutes les permissions, on ne touche pas au propriétaire.
    const everything = {
      userId: 'everything',
      role: { type: 'explicit' },
      permissions: [...PERMISSIONS],
    };
    expect(() => assertCanManage(everything, holder('owner'))).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
    expect(() => assertCanManage(holder('editor'), holder('admin'))).toThrow(
      expect.objectContaining({ code: 'PERMISSION_ESCALATION' }),
    );
  });
});

describe('loadActor', () => {
  it('needs a signed-in user and a transaction', async () => {
    const resolver = /** @type {any} */ ({ resolveFresh: async () => null });

    await expect(
      loadActor(resolver, /** @type {any} */ ({ userId: null, session: null })),
    ).rejects.toThrow(/signed-in user and a transaction/);
    await expect(
      loadActor(resolver, /** @type {any} */ ({ userId: 'u', session: {}, eventId: 'e' })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
