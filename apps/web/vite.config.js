import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // dist/.vite/manifest.json : lu par scripts/check-bundle-budget.js pour mesurer le bundle
    // initial de chaque espace.
    manifest: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['./test/setup.js'],
  },
});
