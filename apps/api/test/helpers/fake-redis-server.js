import { createServer } from 'node:net';

/**
 * Serveur TCP minimal qui parle juste assez le protocole Redis pour qu'ioredis se connecte
 * (vérification INFO) et fasse un ping. Passer `hung` à true pour simuler un Redis qui garde la
 * connexion ouverte mais ne répond plus (processus gelé, partition réseau).
 *
 * @returns {Promise<{ url: string, hung: boolean, close: () => Promise<void> }>}
 */
export async function startFakeRedisServer() {
  /** @type {Set<import('node:net').Socket>} */
  const sockets = new Set();
  const state = { hung: false };

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (chunk) => {
      if (state.hung) {
        return;
      }
      // Les commandes arrivent en tableaux RESP : "*1\r\n$4\r\nPING\r\n". Seul le nom compte ici.
      for (const [, name] of chunk.toString().matchAll(/\*\d+\r\n\$\d+\r\n([A-Za-z]+)\r\n/g)) {
        socket.write(reply(String(name).toUpperCase()));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());

  return {
    url: `redis://127.0.0.1:${port}`,
    get hung() {
      return state.hung;
    },
    set hung(value) {
      state.hung = value;
    },
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(() => resolve());
      }),
  };
}

/**
 * @param {string} command
 * @returns {string}
 */
function reply(command) {
  if (command === 'INFO') {
    const info = 'loading:0\r\n';
    return `$${Buffer.byteLength(info)}\r\n${info}\r\n`;
  }
  return command === 'PING' ? '+PONG\r\n' : '+OK\r\n';
}
