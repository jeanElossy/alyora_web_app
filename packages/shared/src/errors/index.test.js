import { describe, expect, it } from 'vitest';
import { ERROR_CATALOG, ERROR_CODES } from './index.js';

describe('error catalog', () => {
  it('exposes every catalog entry as a code whose value is its own name', () => {
    expect(Object.keys(ERROR_CODES)).toEqual(Object.keys(ERROR_CATALOG));
    for (const [key, value] of Object.entries(ERROR_CODES)) {
      expect(value).toBe(key);
    }
  });

  it('gives every code an HTTP error status and a default message', () => {
    for (const entry of Object.values(ERROR_CATALOG)) {
      expect(entry.httpStatus).toBeGreaterThanOrEqual(400);
      expect(entry.httpStatus).toBeLessThan(600);
      expect(entry.message.length).toBeGreaterThan(0);
    }
  });

  it('cannot be modified at runtime', () => {
    expect(Object.isFrozen(ERROR_CATALOG)).toBe(true);
    expect(Object.isFrozen(ERROR_CATALOG.NOT_FOUND)).toBe(true);
    expect(Object.isFrozen(ERROR_CODES)).toBe(true);
  });
});
