import * as api from '@alyora/api';
import { describe, expect, it } from 'vitest';

describe('@alyora/worker workspace wiring', () => {
  it('resolves @alyora/api through the workspace', () => {
    expect(api).toBeTypeOf('object');
  });

  it('loads its entry point without throwing', async () => {
    await expect(import('./index.js')).resolves.toBeDefined();
  });
});
