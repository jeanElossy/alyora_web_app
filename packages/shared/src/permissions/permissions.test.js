import { describe, expect, it } from 'vitest';
import {
  FINANCIAL_PERMISSIONS,
  PERMISSIONS,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
  hasPermission,
  isOwnerRole,
  isPermission,
  isRoleKey,
  isSubsetOf,
  missingPermissions,
  normalizePermissions,
  permissionsOfRole,
  unknownPermissions,
} from './index.js';

describe('permission catalog', () => {
  it('names every permission module:action, once', () => {
    for (const permission of PERMISSIONS) {
      expect(permission).toMatch(/^[a-z]+:[a-z]+$/);
    }
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('contains the permissions named by the module specification', () => {
    expect(PERMISSIONS).toEqual(
      expect.arrayContaining([
        'guests:read',
        'guests:write',
        'rsvp:manage',
        'seating:publish',
        'contributions:read',
        'contributions:manage',
        'payouts:manage',
        'exports:financial',
        'collaborators:invite',
        'settings:manage',
        'checkin:scan',
      ]),
    );
  });

  it('only lists known permissions as financial', () => {
    expect(FINANCIAL_PERMISSIONS.every(isPermission)).toBe(true);
  });

  it('cannot be modified at runtime', () => {
    expect(Object.isFrozen(PERMISSIONS)).toBe(true);
    expect(Object.isFrozen(FINANCIAL_PERMISSIONS)).toBe(true);
  });

  it('recognizes a permission only by its exact name', () => {
    expect(isPermission('guests:read')).toBe(true);
    expect(isPermission('Guests:Read')).toBe(false);
    expect(isPermission('guests:*')).toBe(false);
    expect(isPermission(undefined)).toBe(false);
  });
});

describe('predefined roles', () => {
  it('defines exactly the five roles, each with known permissions only, frozen', () => {
    expect(ROLE_KEYS).toEqual(['owner', 'admin', 'editor', 'reader', 'checkin_agent']);
    expect(Object.keys(ROLE_PERMISSIONS)).toEqual([...ROLE_KEYS]);
    expect(Object.isFrozen(ROLE_PERMISSIONS)).toBe(true);
    for (const roleKey of ROLE_KEYS) {
      const permissions = permissionsOfRole(roleKey);
      expect(permissions.every(isPermission)).toBe(true);
      expect(Object.isFrozen(permissions)).toBe(true);
    }
  });

  it('gives the owner every permission, and the admin all but payouts', () => {
    expect(permissionsOfRole('owner')).toEqual(PERMISSIONS);
    expect(missingPermissions(PERMISSIONS, permissionsOfRole('admin'))).toEqual(['payouts:manage']);
  });

  it('nests the roles: reader within editor within admin within owner', () => {
    expect(isSubsetOf(permissionsOfRole('reader'), permissionsOfRole('editor'))).toBe(true);
    expect(isSubsetOf(permissionsOfRole('editor'), permissionsOfRole('admin'))).toBe(true);
    expect(isSubsetOf(permissionsOfRole('admin'), permissionsOfRole('owner'))).toBe(true);
    expect(isSubsetOf(permissionsOfRole('checkin_agent'), permissionsOfRole('admin'))).toBe(true);
  });

  it('gives no financial permission to the check-in agent, the reader or the editor', () => {
    for (const roleKey of /** @type {const} */ (['checkin_agent', 'reader', 'editor'])) {
      const financial = permissionsOfRole(roleKey).filter((permission) =>
        FINANCIAL_PERMISSIONS.includes(permission),
      );
      expect(financial, roleKey).toEqual([]);
    }
  });

  it('keeps the reader read-only and the check-in agent away from guest contact details', () => {
    expect(permissionsOfRole('reader').every((permission) => permission.endsWith(':read'))).toBe(
      true,
    );
    expect(permissionsOfRole('checkin_agent')).toEqual([
      'event:read',
      'checkin:read',
      'checkin:scan',
    ]);
  });

  it('recognizes role keys and the owner role', () => {
    expect(isRoleKey('editor')).toBe(true);
    expect(isRoleKey('Editor')).toBe(false);
    expect(isRoleKey('toString')).toBe(false);
    expect(isOwnerRole('owner')).toBe(true);
    expect(isOwnerRole('admin')).toBe(false);
    expect(isOwnerRole(null)).toBe(false);
  });
});

describe('permission sets', () => {
  it('normalizes: drops unknown values and duplicates, follows the catalog order, freezes', () => {
    const normalized = normalizePermissions([
      'guests:write',
      'nope:nope',
      'event:read',
      'guests:write',
      42,
    ]);

    expect(normalized).toEqual(['event:read', 'guests:write']);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(unknownPermissions(['guests:write', 'nope:nope', 42])).toEqual(['nope:nope', 42]);
  });

  it('applies the escalation rule: a grant must be a subset of what is held, or equal', () => {
    const held = permissionsOfRole('editor');

    expect(isSubsetOf(permissionsOfRole('reader'), held)).toBe(true);
    expect(isSubsetOf(held, held)).toBe(true);
    expect(isSubsetOf([], held)).toBe(true);
    expect(isSubsetOf(['guests:read', 'contributions:read'], held)).toBe(false);
    expect(missingPermissions(['payouts:manage', 'guests:read', 'audit:read'], held)).toEqual([
      'payouts:manage',
      'audit:read',
    ]);
  });

  it('tells whether a set holds a permission', () => {
    expect(hasPermission(permissionsOfRole('reader'), 'guests:read')).toBe(true);
    expect(hasPermission(permissionsOfRole('reader'), 'guests:write')).toBe(false);
    expect(hasPermission([], 'event:read')).toBe(false);
  });
});
