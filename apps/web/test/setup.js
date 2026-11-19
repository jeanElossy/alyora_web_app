// Setup des tests Vitest du client web (jsdom).
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { initI18n } from '../src/lib/i18n/i18n.js';

initI18n();

// Sans globals Vitest, Testing Library ne démonte pas les composants seul entre deux tests.
afterEach(() => {
  cleanup();
});
