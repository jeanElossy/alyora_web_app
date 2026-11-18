import { describe, expect, it } from 'vitest';
import { resolveCorrelationId } from './correlation.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('resolveCorrelationId', () => {
  it('reuses a safe incoming id', () => {
    expect(resolveCorrelationId('edge-proxy_0123456789')).toBe('edge-proxy_0123456789');
  });

  it.each([
    ['missing', undefined],
    ['too short', 'abc'],
    ['too long', 'a'.repeat(65)],
    ['with a space', 'abc def ghi'],
    ['with a newline (log injection)', 'abcdefgh\n{"level":"fatal"}'],
    ['with quotes', '"abcdefgh"'],
    ['not a string', ['abcdefgh']],
  ])('replaces an id that is %s by a fresh UUID', (_label, incoming) => {
    expect(resolveCorrelationId(incoming)).toMatch(UUID);
  });

  it('generates a different id for every request', () => {
    expect(resolveCorrelationId(undefined)).not.toBe(resolveCorrelationId(undefined));
  });
});
