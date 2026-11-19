import { describe, expect, it } from 'vitest';
import { CLIENT_ERROR_CODES, ERROR_CATALOG, ERROR_CODES } from './index.js';

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

describe('client error codes', () => {
  it('never reuse a code of the API catalog', () => {
    for (const code of Object.keys(CLIENT_ERROR_CODES)) {
      expect(Object.hasOwn(ERROR_CATALOG, code)).toBe(false);
    }
  });

  it('are codes whose value is their own name, frozen', () => {
    for (const [key, value] of Object.entries(CLIENT_ERROR_CODES)) {
      expect(value).toBe(key);
    }
    expect(Object.isFrozen(CLIENT_ERROR_CODES)).toBe(true);
  });
});
