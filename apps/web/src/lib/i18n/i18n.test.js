import { CLIENT_ERROR_CODES, ERROR_CODES } from '@alyora/shared';
import { afterEach, describe, expect, it } from 'vitest';
import common from '../../locales/common/fr.json';
import admin from '../../spaces/admin/locales/fr.json';
import checkin from '../../spaces/checkin/locales/fr.json';
import organizer from '../../spaces/organizer/locales/fr.json';
import publicSpace from '../../spaces/public/locales/fr.json';
import { DEFAULT_LANGUAGE, KEYS_LANGUAGE, initI18n, registerNamespace } from './i18n.js';

const i18n = initI18n();

afterEach(async () => {
  await i18n.changeLanguage(DEFAULT_LANGUAGE);
});

/**
 * Clés feuilles d'un fichier de traduction ("home.title", ...).
 *
 * @param {Record<string, unknown>} resources
 * @param {string} [prefix]
 * @returns {string[]}
 */
function leafKeys(resources, prefix = '') {
  return Object.entries(resources).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? leafKeys(/** @type {Record<string, unknown>} */ (value), `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('i18n', () => {
  it('starts in French, synchronously, with the common texts', () => {
    expect(i18n.language).toBe('fr');
    expect(i18n.t('loading')).toBe('Chargement en cours…');
  });

  it('translates every error code of the API catalog and of the client', () => {
    for (const code of [...Object.keys(ERROR_CODES), ...Object.keys(CLIENT_ERROR_CODES)]) {
      expect(i18n.exists(`errors.${code}`), code).toBe(true);
    }
  });

  it('gives the three protected spaces the same set of texts', () => {
    expect(leafKeys(checkin)).toEqual(leafKeys(organizer));
    expect(leafKeys(admin)).toEqual(leafKeys(organizer));
  });

  it('never leaves a translation empty', () => {
    for (const resources of [common, publicSpace, organizer, checkin, admin]) {
      for (const key of leafKeys(resources)) {
        const value = key
          .split('.')
          .reduce(
            (/** @type {any} */ node, segment) => node[segment],
            /** @type {any} */ (resources),
          );
        expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true);
      }
    }
  });

  it('registers a namespace once, and returns keys in the keys language', async () => {
    registerNamespace('test-space', { title: 'Titre' });
    registerNamespace('test-space', { title: 'Autre' });
    expect(i18n.t('title', { ns: 'test-space' })).toBe('Titre');

    await i18n.changeLanguage(KEYS_LANGUAGE);

    expect(i18n.t('title', { ns: 'test-space' })).toBe('title');
  });
});
