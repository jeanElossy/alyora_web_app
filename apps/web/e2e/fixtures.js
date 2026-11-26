import { test as base, expect } from '@playwright/test';

/**
 * `test` de Playwright, avec une garde : chaque test échoue si une page enfreint la politique
 * de sécurité du contenu (CSP). `vite preview` sert les en-têtes de la production
 * (vercel.json) : un script, un style, une image ou un appel que la CSP bloquerait en ligne
 * fait donc échouer le test qui le déclenche, au lieu de passer inaperçu. Les violations sont
 * remontées au fil des navigations, page après page.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    /** @type {string[]} */
    const violations = [];
    await page.exposeFunction('reportCspViolation', (/** @type {string} */ violation) => {
      violations.push(violation);
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        /** @type {Window & { reportCspViolation: (violation: string) => void }} */ (
          /** @type {unknown} */ (window)
        ).reportCspViolation(`${event.effectiveDirective} ← ${event.blockedURI}`);
      });
    });
    await use(page);
    expect(violations, 'violations de la CSP').toEqual([]);
  },
});

export { expect };
