import { describe, expect, it } from 'vitest';
import { createTranslator, supportedLocale } from './translator.js';

const { t } = createTranslator({
  resources: {
    fr: {
      demo: {
        hello: 'Bonjour {{name}}',
        minutes_one: '{{count}} minute',
        minutes_other: '{{count}} minutes',
      },
    },
  },
  namespace: 'demo',
});

describe('server translator', () => {
  it('interpolates without escaping: the caller escapes what becomes HTML', () => {
    expect(t('fr', 'hello', { name: 'Awa & <Koné>' })).toBe('Bonjour Awa & <Koné>');
  });

  it('chooses the French plural from count', () => {
    expect(t('fr', 'minutes', { count: 1 })).toBe('1 minute');
    expect(t('fr', 'minutes', { count: 60 })).toBe('60 minutes');
  });

  it('uses the default language for an unknown or missing one', () => {
    expect(supportedLocale('xx')).toBe('fr');
    expect(supportedLocale(null)).toBe('fr');
    expect(t('xx', 'hello', { name: 'Awa' })).toBe('Bonjour Awa');
  });
});
