import { describe, expect, it } from 'vitest';
import { eventIdParamsSchema, myPermissionsResponseSchema } from './access.schema.js';

const EVENT_ID = '6b0790c7ff6f6a3544c1b7bb';

describe('eventIdParamsSchema', () => {
  it('accepts an ObjectId and nothing else', () => {
    expect(eventIdParamsSchema.safeParse({ eventId: EVENT_ID }).success).toBe(true);
    expect(eventIdParamsSchema.safeParse({ eventId: EVENT_ID.toUpperCase() }).success).toBe(false);
    expect(eventIdParamsSchema.safeParse({ eventId: '{"$ne":null}' }).success).toBe(false);
    expect(eventIdParamsSchema.safeParse({ eventId: { $ne: null } }).success).toBe(false);
    expect(eventIdParamsSchema.safeParse({ eventId: EVENT_ID, other: 'x' }).success).toBe(false);
  });
});

describe('myPermissionsResponseSchema', () => {
  it('describes the role and only known permissions', () => {
    const predefined = {
      eventId: EVENT_ID,
      role: { type: 'predefined', key: 'reader' },
      permissions: ['event:read', 'guests:read'],
    };
    const custom = {
      eventId: EVENT_ID,
      role: { type: 'custom', customRoleId: EVENT_ID },
      permissions: [],
    };

    expect(myPermissionsResponseSchema.parse(predefined)).toEqual(predefined);
    expect(myPermissionsResponseSchema.parse(custom)).toEqual(custom);
    expect(
      myPermissionsResponseSchema.safeParse({ ...predefined, permissions: ['guests:delete'] })
        .success,
    ).toBe(false);
    expect(
      myPermissionsResponseSchema.safeParse({
        ...predefined,
        role: { type: 'predefined', key: 'superadmin' },
      }).success,
    ).toBe(false);
  });
});
