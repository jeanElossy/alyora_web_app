import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { getCorrelationId, getRequestContext, runWithContext } from './request-context.js';

describe('request context', () => {
  it('is empty outside of any unit of work', () => {
    expect(getRequestContext()).toBeUndefined();
    expect(getCorrelationId()).toBeUndefined();
  });

  it('is visible to everything the function triggers, across awaits and timers', async () => {
    const seen = await runWithContext({ correlationId: 'req-12345678' }, async () => {
      const before = getCorrelationId();
      await delay(5);
      const afterAwait = getCorrelationId();
      const inTimer = await new Promise((resolve) => {
        setTimeout(() => resolve(getCorrelationId()), 1);
      });
      return [before, afterAwait, inTimer];
    });

    expect(seen).toEqual(['req-12345678', 'req-12345678', 'req-12345678']);
    expect(getCorrelationId()).toBeUndefined();
  });

  it('cannot be modified by the code running inside it', () => {
    runWithContext({ correlationId: 'req-12345678' }, () => {
      const context = /** @type {{ correlationId: string }} */ (getRequestContext());

      expect(() => {
        context.correlationId = 'forged';
      }).toThrow(TypeError);
    });
  });

  it('keeps 50 interleaved concurrent units of work isolated from each other (race)', async () => {
    const ids = Array.from({ length: 50 }, (_, index) => `req-${String(index).padStart(8, '0')}`);

    const observed = await Promise.all(
      ids.map((correlationId, index) =>
        runWithContext({ correlationId }, async () => {
          /** @type {Array<string | undefined>} */
          const readings = [];
          for (let step = 0; step < 3; step += 1) {
            // Des délais différents font s'entremêler les continuations.
            await delay((index * 7 + step * 3) % 11);
            readings.push(getCorrelationId());
          }
          return { correlationId, readings };
        }),
      ),
    );

    for (const { correlationId, readings } of observed) {
      expect(readings).toEqual([correlationId, correlationId, correlationId]);
    }
  });
});
