import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import { createTestLogger } from '../../../test/helpers/app.js';
import { closeGracefully, installProcessHandlers } from './lifecycle.js';

/** @param {Partial<Parameters<typeof installProcessHandlers>[0]>} [overrides] */
function install(overrides = {}) {
  const processRef = new EventEmitter();
  const exit = vi.fn();
  const shutdown = vi.fn(async () => {});
  const { logger, logs } = createTestLogger();
  const handlers = installProcessHandlers({ processRef, logger, shutdown, exit, ...overrides });
  return { processRef, exit, shutdown, logs, handlers };
}

describe('installProcessHandlers', () => {
  it.each(['SIGTERM', 'SIGINT'])(
    'shuts down gracefully on %s, then exits with 0',
    async (signal) => {
      const { processRef, exit, shutdown } = install();

      processRef.emit(signal);

      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
      expect(shutdown).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ['uncaughtException', new Error('boom')],
    ['unhandledRejection', new Error('rejected')],
  ])('logs a fatal line on %s, shuts down, then exits with 1', async (event, error) => {
    const { processRef, exit, shutdown, logs } = install();

    processRef.emit(event, error);

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(shutdown).toHaveBeenCalledOnce();
    expect(logs.entries()[0]).toMatchObject({ level: 'fatal', err: { message: error.message } });
  });

  it('runs the shutdown only once, and exits with 1 if a fatal error interrupts a graceful stop', async () => {
    const shutdown = vi.fn(() => delay(30));
    const { processRef, exit } = install({ shutdown });

    processRef.emit('SIGTERM');
    processRef.emit('uncaughtException', new Error('during shutdown'));

    await vi.waitFor(() => expect(exit).toHaveBeenCalled());
    expect(shutdown).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits anyway when the shutdown exceeds its budget', async () => {
    const { processRef, exit, logs } = install({ shutdown: () => delay(1_000), timeoutMs: 20 });

    processRef.emit('SIGTERM');

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(logs.entries().some((entry) => entry.msg === 'Shutdown did not complete cleanly')).toBe(
      true,
    );
  });

  it('exposes terminate() for an explicit stop', async () => {
    const { exit, handlers } = install();

    await handlers.terminate('test', 0);

    expect(exit).toHaveBeenCalledWith(0);
  });
});

describe('closeGracefully', () => {
  it('lets an in-flight request complete, then closes the resources in order', async () => {
    /** @type {string[]} */
    const events = [];
    /** @type {(value?: unknown) => void} */
    let markReceived = () => {};
    const received = new Promise((resolve) => {
      markReceived = resolve;
    });
    const server = createServer(async (_req, res) => {
      markReceived();
      await delay(50);
      events.push('request completed');
      res.end('ok');
    });
    await new Promise((resolve) => server.listen(0, () => resolve(undefined)));
    const address = /** @type {import('node:net').AddressInfo} */ (server.address());
    const { logger } = createTestLogger();

    const inFlight = fetch(`http://127.0.0.1:${address.port}/`).then((response) => response.text());
    // N'arrêter qu'une fois la requête en cours de traitement : c'est le sens de « en cours ».
    await received;
    await closeGracefully({
      server,
      logger,
      resources: [
        { name: 'mongo', close: async () => void events.push('mongo closed') },
        { name: 'redis', close: async () => void events.push('redis closed') },
      ],
    });

    await expect(inFlight).resolves.toBe('ok');
    expect(events).toEqual(['request completed', 'mongo closed', 'redis closed']);
    expect(server.listening).toBe(false);
  });

  it('keeps closing the other resources when one fails', async () => {
    const { logger, logs } = createTestLogger();
    const closeRedis = vi.fn(async () => {});

    await closeGracefully({
      logger,
      resources: [
        {
          name: 'mongo',
          close: async () => {
            throw new Error('already closed');
          },
        },
        { name: 'redis', close: closeRedis },
      ],
    });

    expect(closeRedis).toHaveBeenCalledOnce();
    expect(logs.entries()[0]).toMatchObject({ level: 'error', resource: 'mongo' });
  });

  it('rejects when the server cannot be closed', async () => {
    const { logger } = createTestLogger();
    const server = createServer();
    await new Promise((resolve) => server.listen(0, () => resolve(undefined)));
    vi.spyOn(server, 'close').mockImplementation((callback) => {
      callback?.(new Error('close failed'));
      return server;
    });

    await expect(closeGracefully({ server, logger, resources: [] })).rejects.toThrow(
      'close failed',
    );
    vi.restoreAllMocks();
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  });
});
