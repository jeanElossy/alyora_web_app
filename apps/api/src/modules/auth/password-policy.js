import { readFileSync } from 'node:fs';
import { AppError } from '../../lib/errors/app-error.js';

/**
 * Liste embarquée, sans aucun appel réseau : les mots de passe d'au moins 10 caractères des
 * 100 000 plus utilisés publiés par le NCSC britannique (SecLists, licence MIT), plus quelques
 * mots de passe courants en français et en Côte d'Ivoire. En minuscules, un par ligne.
 */
const COMMON_PASSWORDS_FILE = new URL('./data/common-passwords.txt', import.meta.url);

/** Mot de la plateforme, qu'un mot de passe ne doit pas contenir. */
const SERVICE_WORDS = ['alyora'];

/** Longueur à partir de laquelle un élément personnel est cherché dans le mot de passe. */
const MIN_PERSONAL_WORD_LENGTH = 4;

/** En dessous de ce nombre de caractères différents, le mot de passe est une répétition. */
const MIN_DISTINCT_CHARACTERS = 4;

/** @type {Set<string> | undefined} */
let commonPasswords;

function loadCommonPasswords() {
  commonPasswords ??= new Set(
    readFileSync(COMMON_PASSWORDS_FILE, 'utf8').split('\n').filter(Boolean),
  );
  return commonPasswords;
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalize(value) {
  return value.normalize('NFKC').toLowerCase();
}

/**
 * Raison du refus d'un nouveau mot de passe, ou null s'il est acceptable. La longueur
 * (10 à 128) est vérifiée avant, par le schéma partagé. Suit NIST SP 800-63B : pas de règle
 * de composition (majuscule, chiffre...), mais le refus des mots de passe connus, répétitifs
 * ou construits sur des éléments du compte.
 *
 * @param {string} password
 * @param {{ email: string, firstName?: string, lastName?: string }} account
 * @returns {'password_too_common' | 'password_too_repetitive' | 'password_contains_personal_info' | null}
 */
export function passwordWeakness(password, { email, firstName, lastName }) {
  const candidate = normalize(password);
  if (loadCommonPasswords().has(candidate)) {
    return 'password_too_common';
  }
  if (new Set(candidate).size < MIN_DISTINCT_CHARACTERS) {
    return 'password_too_repetitive';
  }
  const personal = [email.split('@')[0] ?? '', firstName ?? '', lastName ?? '', ...SERVICE_WORDS]
    .map(normalize)
    .filter((word) => word.length >= MIN_PERSONAL_WORD_LENGTH);
  if (personal.some((word) => candidate.includes(word))) {
    return 'password_contains_personal_info';
  }
  return null;
}

/**
 * Lève VALIDATION_ERROR, sur le champ `password`, pour un mot de passe refusé. Le mot de passe
 * n'apparaît ni dans l'erreur ni dans les logs.
 *
 * @param {string} password
 * @param {{ email: string, firstName?: string, lastName?: string }} account
 * @param {string} [field] Nom du champ dans la requête.
 */
export function assertAcceptablePassword(password, account, field = 'password') {
  const weakness = passwordWeakness(password, account);
  if (weakness) {
    throw new AppError('VALIDATION_ERROR', {
      message: 'Password refused',
      details: { issues: [{ path: field, code: weakness, message: 'Password refused' }] },
    });
  }
}
