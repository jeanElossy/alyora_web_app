import { describe, expect, it } from 'vitest';
import {
  acceptInvitationRequestSchema,
  createInvitationRequestSchema,
  roleAssignmentSchema,
} from './collaboration.schema.js';
import { cursorPageQuerySchema } from './pagination.schema.js';

const ID = '6b0790c7ff6f6a3544c1b7bb';

describe('roleAssignmentSchema', () => {
  it('accepts a predefined role, a custom role or an explicit list of known permissions', () => {
    for (const role of [
      { type: 'predefined', key: 'reader' },
      { type: 'predefined', key: 'owner' },
      { type: 'custom', customRoleId: ID },
      { type: 'explicit', permissions: ['event:read', 'checkin:scan'] },
    ]) {
      expect(roleAssignmentSchema.safeParse(role).success, JSON.stringify(role)).toBe(true);
    }
  });

  it('refuses an unknown role or permission, an empty list, and mixed shapes', () => {
    for (const role of [
      { type: 'predefined', key: 'superadmin' },
      { type: 'explicit', permissions: [] },
      { type: 'explicit', permissions: ['guests:delete'] },
      { type: 'custom', customRoleId: { $ne: null } },
      { type: 'predefined', key: 'reader', permissions: ['event:read'] },
      { type: 'everything' },
    ]) {
      expect(roleAssignmentSchema.safeParse(role).success, JSON.stringify(role)).toBe(false);
    }
  });
});

describe('invitation requests', () => {
  it('normalizes the invited address', () => {
    expect(
      createInvitationRequestSchema.parse({
        email: '  Awa.Kone@Exemple.CI ',
        role: { type: 'predefined', key: 'editor' },
      }).email,
    ).toBe('awa.kone@exemple.ci');
  });

  it('accepts only a 128-bit token in base64url', () => {
    expect(acceptInvitationRequestSchema.safeParse({ token: 'a'.repeat(22) }).success).toBe(true);
    expect(acceptInvitationRequestSchema.safeParse({ token: 'a'.repeat(43) }).success).toBe(false);
    expect(acceptInvitationRequestSchema.safeParse({ token: `${'a'.repeat(21)}=` }).success).toBe(
      false,
    );
  });
});

describe('cursorPageQuerySchema', () => {
  it('reads the query string, with a bounded default page size', () => {
    expect(cursorPageQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(cursorPageQuerySchema.parse({ cursor: ID, limit: '20' })).toEqual({
      cursor: ID,
      limit: 20,
    });
    expect(cursorPageQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(cursorPageQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(cursorPageQuerySchema.safeParse({ skip: '10' }).success).toBe(false);
  });
});
