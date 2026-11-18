import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import * as api from './index.js';

const ENTRY = fileURLToPath(new URL('./index.js', import.meta.url));

describe('@alyora/api library entry point', () => {
  it('exposes the building blocks the worker needs', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'AppError',
        'createLogger',
        'getCorrelationId',
        'getRequestContext',
        'isAppError',
        'runWithContext',
      ].sort(),
    );
  });

  it('has no side effect: a process that only imports it exits on its own, silently', async () => {
    // Un serveur, une connexion ou un minuteur ouvert garderait le processus enfant en vie
    // jusqu'à ce que le délai le tue ; toute ligne de log apparaîtrait sur stdout ou stderr.
    const script = `await import(${JSON.stringify(ENTRY)});`;

    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      ['--input-type=module', '--eval', script],
      { timeout: 10_000, env: { PATH: process.env.PATH ?? '' } },
    );

    expect(stdout).toBe('');
    expect(stderr).toBe('');
  });
});
