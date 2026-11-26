import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * En-têtes de sécurité de la production, tels que Vercel les sert (vercel.json, règle « /(.*) »).
 * `vite preview` les sert aussi : les tests de bout en bout, lancés sur le build, vérifient ainsi
 * que l'application fonctionne sous la vraie CSP. Pas en développement (`vite`) : le
 * rechargement à chaud de React y injecte un script en ligne, que la CSP bloquerait.
 *
 * @returns {Record<string, string>}
 */
function productionHeaders() {
  /** @type {{ headers?: Array<{ source: string, headers: Array<{ key: string, value: string }> }> }} */
  const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'));
  const rule = vercel.headers?.find(({ source }) => source === '/(.*)');
  return Object.fromEntries((rule?.headers ?? []).map(({ key, value }) => [key, value]));
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // dist/.vite/manifest.json : lu par scripts/check-bundle-budget.js pour mesurer le bundle
    // initial de chaque espace.
    manifest: true,
  },
  preview: {
    headers: productionHeaders(),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['./test/setup.js'],
  },
});
