import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'test/**/*.test.js'],
    // Démarre un seul replica set MongoDB en mémoire pour toute l'exécution.
    globalSetup: ['./test/setup/global-setup.js'],
    testTimeout: 20_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.js'],
      exclude: ['**/*.test.js'],
      reporter: ['text', 'text-summary'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
