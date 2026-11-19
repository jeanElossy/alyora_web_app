// Setup des tests Vitest du client web (jsdom).
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { initI18n } from '../src/lib/i18n/i18n.js';

initI18n();

// API du navigateur absentes de jsdom, dont les primitives Radix ont besoin (mesure des
// éléments, capture du pointeur, défilement jusqu'à l'option choisie d'une liste).
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
for (const [name, implementation] of /** @type {const} */ ([
  ['hasPointerCapture', () => false],
  ['setPointerCapture', () => {}],
  ['releasePointerCapture', () => {}],
  ['scrollIntoView', () => {}],
])) {
  if (!(name in Element.prototype)) {
    Object.defineProperty(Element.prototype, name, { value: implementation, configurable: true });
  }
}

// Sans globals Vitest, Testing Library ne démonte pas les composants seul entre deux tests.
afterEach(() => {
  cleanup();
});
