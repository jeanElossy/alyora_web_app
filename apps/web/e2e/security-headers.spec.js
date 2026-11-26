import { expect, test } from './fixtures.js';

// Les en-têtes de sécurité de la production (vercel.json), servis aussi par `vite preview`.
test('serves the security headers on every page, refusing to be framed', async ({ page }) => {
  for (const path of ['/', '/organisateur/connexion', '/organisateur/securite']) {
    const response = await page.goto(path);
    const headers = response?.headers() ?? {};

    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).toContain("script-src 'self';");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('same-origin');
  }
});
