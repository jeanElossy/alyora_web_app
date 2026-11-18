import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { TimeoutError, withTimeout } from './with-timeout.js';

describe('withTimeout', () => {
  it('resolves with the operation result when it settles in time', async () => {
    await expect(withTimeout(async () => 'done', 100, 'too slow')).resolves.toBe('done');
  });

  it('rejects with a TimeoutError when the operation is too slow', async () => {
    const result = withTimeout(() => delay(200), 10, 'Mongo check timed out');

    await expect(result).rejects.toBeInstanceOf(TimeoutError);
    await expect(result).rejects.toThrow('Mongo check timed out');
  });

  it('propagates the error of an operation that fails, even synchronously', async () => {
    await expect(
      withTimeout(
        () => {
          throw new Error('sync failure');
        },
        100,
        'too slow',
      ),
    ).rejects.toThrow('sync failure');
    await expect(
      withTimeout(() => Promise.reject(new Error('async failure')), 100, 'x'),
    ).rejects.toThrow('async failure');
  });
});
